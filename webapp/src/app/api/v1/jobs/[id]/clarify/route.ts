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
  const scrapingRequest = { url: job.url, prompt: enhancedPrompt }

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


