import { NextRequest, NextResponse } from 'next/server'
import { authenticateExternalApi } from '@/lib/api/auth'
import { createOrchestrator } from '@/lib/codegen/orchestrator'
import { db } from '@/lib/supabase'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticateExternalApi(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const jobId = params.id
  const { timeout_ms = 300000, max_items = 1000 } = await req.json().catch(() => ({}))

  const result = await db.getJobWithScript(jobId)
  if (!result || !result.script) return NextResponse.json({ error: 'Job or script not found' }, { status: 404 })

  const { job, script } = result
  await db.updateScrapingJob(jobId, { status: 'running' })

  const orchestrator = createOrchestrator({ maxRefinementAttempts: 1, testTimeout: timeout_ms })
  const codegenJob = {
    id: jobId,
    request: { url: job.url, prompt: job.prompt || '' },
    script: {
      id: script.id,
      toolType: script.tool_type,
      code: script.generated_code,
      testCode: script.generated_code,
      fullCode: script.generated_code,
      createdAt: new Date(script.created_at),
      version: script.version,
      explanation: script.explanation,
      dependencies: script.dependencies,
      requirements: script.requirements
    },
    requirements: script.requirements,
    status: 'executing' as const,
    iterations: 0,
    createdAt: new Date(job.created_at),
    updatedAt: new Date(),
    title: job.title || script.title
  }

  const updatedJob = await orchestrator.executeScript(codegenJob, { timeout: timeout_ms, maxItems: max_items })
  const exec = updatedJob.executionResult!

  if (exec.success && exec.data.length > 0) {
    await db.insertScrapedData(jobId, exec.data)
  }

  await db.updateScrapingJob(jobId, {
    status: exec.success ? 'completed' : 'failed',
    completed_at: new Date().toISOString(),
    total_items: exec.totalFound || 0,
    execution_time: exec.executionTime || 0,
    errors: exec.errors && exec.errors.length > 0 ? exec.errors : undefined
  })

  return NextResponse.json({ jobId, status: exec.success ? 'completed' : 'failed', result: { totalFound: exec.totalFound, errors: exec.errors, executionTime: exec.executionTime } })
}


