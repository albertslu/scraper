import { NextRequest, NextResponse } from 'next/server'
import { createOrchestrator } from '@/lib/codegen/orchestrator'
import { db } from '@/lib/supabase'
import { authenticateExternalApi } from '@/lib/api/auth'

export async function POST(req: NextRequest) {
  const auth = authenticateExternalApi(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const match = req.url.match(/\/api\/v1\/jobs\/([^/]+)/)
  const jobId = match?.[1]
  if (!jobId) return NextResponse.json({ error: 'Missing job id' }, { status: 400 })
  const { answers } = await req.json().catch(() => ({}))
  if (!answers || typeof answers !== 'object') return NextResponse.json({ error: 'answers required' }, { status: 400 })

  const result = await db.getJobWithScript(jobId)
  if (!result || !result.script) return NextResponse.json({ error: 'Job or script not found' }, { status: 404 })
  const { job, script } = result

  const enhancedPrompt = `${script.prompt}\n\nUser Clarifications:\n${Object.entries(answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n\n')}`
  const orchestrator = createOrchestrator({ maxRefinementAttempts: 2, testTimeout: 30000 })

  // Build lightweight page hints JSON (title, pagination flags/labels, compact DOM digest)
  let pageHints: any
  try {
    const res = await fetch(job.url, { method: 'GET' })
    const html = await res.text()
    const lower = html.toLowerCase()

    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
    const pageTitle = titleMatch?.[1]?.trim()

    const labels: string[] = []
    if (lower.includes('load more')) labels.push('load more')
    if (lower.includes('show more')) labels.push('show more')
    if (lower.includes('next')) labels.push('next')
    if (lower.includes('prev')) labels.push('prev')
    if (lower.match(/page\s*\d+/)) labels.push('page N')

    const classMatches = Array.from(html.matchAll(/class\s*=\s*"([^"]+)"/gi))
    const classCounts: Record<string, number> = {}
    classMatches.slice(0, 2000).forEach((m) => {
      const parts = m[1].split(/\s+/).slice(0, 2)
      parts.forEach((c) => { if (!c) return; classCounts[c] = (classCounts[c] || 0) + 1 })
    })
    const commonClasses = Object.entries(classCounts).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([n]) => n)

    const idMatches = Array.from(html.matchAll(/id\s*=\s*"([^"]+)"/gi))
    const idCounts: Record<string, number> = {}
    idMatches.slice(0, 2000).forEach((m) => { const id = m[1]; if (id) idCounts[id] = (idCounts[id] || 0) + 1 })
    const commonIds = Object.entries(idCounts).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([n]) => n)

    pageHints = {
      pageTitle,
      pagination: {
        hasLoadMore: labels.includes('load more') || labels.includes('show more'),
        hasNext: labels.includes('next'),
        labels: Array.from(new Set(labels))
      },
      domDigest: { commonClasses, commonIds },
      contentLength: html.length
    }
  } catch (e) {
    // Non-fatal
  }

  const scrapingRequest = { 
    url: job.url, 
    prompt: enhancedPrompt,
    retryContext: {
      previousAttempt: {
        totalFound: 0,
        expectedItems: 0,
        issues: ['User clarification retry'],
        sampleData: [],
        previousToolType: script.tool_type,
        previousCode: script.generated_code
      },
      retryStrategy: ['Refine existing approach with user answers'],
      isRetry: true,
      pageHints
    }
  }

  const codegenJob = await orchestrator.executeCodegenPipeline(scrapingRequest)
  if (!codegenJob.script || !codegenJob.requirements) return NextResponse.json({ error: 'Code generation failed' }, { status: 500 })

  const testResults = await orchestrator.testAndClarify(codegenJob, scrapingRequest)
  await db.updateScraperScript(script.id, {
    title: codegenJob.title,
    generated_code: codegenJob.script.code,
    requirements: codegenJob.requirements,
    tool_type: codegenJob.script.toolType as any,
    output_schema: codegenJob.requirements.outputFields,
    explanation: codegenJob.script.explanation,
    dependencies: codegenJob.script.dependencies
  })

  if (testResults.needsValidation) {
    return NextResponse.json({
      jobId,
      scriptId: script.id,
      status: 'waiting_for_validation',
      title: codegenJob.title,
      tool: codegenJob.script.toolType,
      sampleData: testResults.testResult.data || []
    })
  }

  if (testResults.clarifyingQuestions) {
    return NextResponse.json({
      jobId,
      scriptId: script.id,
      status: 'waiting_for_clarification',
      title: codegenJob.title,
      clarifyingQuestions: testResults.clarifyingQuestions
    })
  }

  return NextResponse.json({ jobId, scriptId: script.id, status: 'ready_to_execute' })
}


