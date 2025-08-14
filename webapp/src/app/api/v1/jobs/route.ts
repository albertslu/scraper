import { NextRequest, NextResponse } from 'next/server'
import { authenticateExternalApi } from '@/lib/api/auth'
import { createOrchestrator } from '@/lib/codegen/orchestrator'
import { db } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const auth = authenticateExternalApi(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { url, prompt, mode = 'interactive', options = {}, clarifications } = body || {}
  if (!url || !prompt) return NextResponse.json({ error: 'url and prompt are required' }, { status: 400 })

  const orchestrator = createOrchestrator({
    maxRefinementAttempts: typeof options.max_refinement_attempts === 'number' ? options.max_refinement_attempts : 2,
    testTimeout: typeof options.test_timeout_ms === 'number' ? options.test_timeout_ms : 30000
  })

  const scrapingRequest = { url, prompt: clarifications ? `${prompt}\n\nUser clarifications: ${JSON.stringify(clarifications)}` : prompt }
  const codegenJob = await orchestrator.executeCodegenPipeline(scrapingRequest)
  if (!codegenJob.script || !codegenJob.requirements) return NextResponse.json({ error: 'Code generation failed' }, { status: 500 })

  const savedScript = await db.createScraperScript({
    title: codegenJob.title,
    prompt,
    url,
    generated_code: codegenJob.script.code,
    requirements: codegenJob.requirements,
    tool_type: codegenJob.script.toolType as any,
    output_schema: codegenJob.requirements.outputFields,
    explanation: codegenJob.script.explanation,
    dependencies: codegenJob.script.dependencies
  })

  const job = await db.createScrapingJob(url, { prompt, title: codegenJob.title, script_id: savedScript.id })

  const testResults = await orchestrator.testAndClarify(codegenJob, scrapingRequest)

  if (testResults.needsValidation) {
    return NextResponse.json({
      jobId: job.id,
      scriptId: savedScript.id,
      status: 'waiting_for_validation',
      title: codegenJob.title,
      tool: savedScript.tool_type,
      sampleData: testResults.testResult.data || []
    })
  }

  if (testResults.clarifyingQuestions) {
    return NextResponse.json({
      jobId: job.id,
      scriptId: savedScript.id,
      status: 'waiting_for_clarification',
      title: codegenJob.title,
      clarifyingQuestions: testResults.clarifyingQuestions
    })
  }

  if (mode === 'auto' && testResults.testResult?.totalFound > 0 && options?.auto_proceed_on_test_success) {
    return NextResponse.json({ jobId: job.id, status: 'executing' })
  }

  return NextResponse.json({ jobId: job.id, scriptId: savedScript.id, status: 'ready_to_execute' })
}


