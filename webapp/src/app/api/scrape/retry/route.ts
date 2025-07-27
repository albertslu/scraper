import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { createOrchestrator } from '@/lib/codegen/orchestrator'

interface PreviousContext {
  previousResults: any[]
  totalFound: number
  expectedItems: number
  issues: string[]
}

export async function POST(request: NextRequest) {
  try {
    const { jobId, previousContext }: { jobId: string, previousContext: PreviousContext } = await request.json()
    
    if (!jobId) {
      return NextResponse.json({ 
        error: 'Job ID is required' 
      }, { status: 400 })
    }

    console.log('🔄 Starting retry for job:', jobId)
    console.log('📊 Previous context:', {
      totalFound: previousContext.totalFound,
      expectedItems: previousContext.expectedItems,
      issues: previousContext.issues
    })

    // Get job and script details
    const result = await db.getJobWithScript(jobId)
    if (!result || !result.script) {
      return NextResponse.json({
        success: false,
        error: 'Job or script not found'
      }, { status: 404 })
    }

    const { job, script } = result

    // Update job status to running
    await db.updateScrapingJob(jobId, { 
      status: 'running' 
    })

    try {
      // Create orchestrator for full pipeline retry
      const orchestrator = createOrchestrator({
        maxRefinementAttempts: 2, // Allow more refinement for retries
        testTimeout: 300000 // 5 minutes
      })

      console.log('🔄 Starting focused retry (skip prompt parsing → improved codegen → execute)...')
      console.log('📊 Using context from previous attempt')

      // Create retry request (no prompt enhancement needed)
      const retryRequest = {
        url: job.url,
        prompt: job.prompt || ''
      }

      // Prepare retry context for code generation
      const retryContext = {
        previousToolType: script.tool_type,
        previousCode: script.generated_code,
        totalFound: previousContext.totalFound,
        expectedItems: previousContext.expectedItems,
        issues: previousContext.issues,
        sampleData: previousContext.previousResults.slice(0, 3)
      }

      console.log('🚀 Executing retry codegen (reusing existing requirements)...')
      
      // Use existing requirements, skip prompt parsing, generate improved code
      const codegenJob = await orchestrator.executeRetryCodegen(script.requirements, retryRequest, retryContext)

      if (!codegenJob.script || !codegenJob.requirements) {
        throw new Error('Retry code generation failed - no script or requirements generated')
      }

      console.log('✅ New code generated for retry!')
      console.log('🛠️ New tool type:', codegenJob.script.toolType)
      console.log('🆚 Previous tool type:', script.tool_type)

      // Save the NEW generated script to database
      const newScript = await db.createScraperScript({
        title: `${codegenJob.title} (Retry)`,
        prompt: retryRequest.prompt,
        url: job.url,
        generated_code: codegenJob.script.code,
        requirements: codegenJob.requirements,
        tool_type: codegenJob.script.toolType,
        output_schema: codegenJob.requirements.outputFields,
        explanation: codegenJob.script.explanation,
        dependencies: codegenJob.script.dependencies
        // Note: Removed parent_script_id since column doesn't exist yet
      })

      // Update the job to reference the new script
      await db.updateScrapingJob(jobId, {
        script_id: newScript.id,
        title: codegenJob.title
      })

      // Now execute the NEW script
      console.log('🎬 Executing newly generated retry script...')
      const executionJob = await orchestrator.executeScript(codegenJob, {
        timeout: 300000
      })

      const executionResult = executionJob.executionResult!

      console.log(`✅ Retry execution completed: ${executionResult.totalFound} items found`)

      // Save new results to database (append to existing)
      if (executionResult.success && executionResult.data.length > 0) {
        await db.insertScrapedData(jobId, executionResult.data)
        console.log('💾 New retry data saved to database')
      }

      // Update job status
      await db.updateScrapingJob(jobId, {
        status: executionResult.success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        total_items: (previousContext.totalFound + (executionResult.totalFound || 0)),
        execution_time: executionResult.executionTime || 0,
        errors: executionResult.errors && executionResult.errors.length > 0 ? executionResult.errors : undefined
      })

      return NextResponse.json({
        success: executionResult.success,
        jobId: jobId,
        result: {
          totalFound: executionResult.totalFound || 0,
          newItemsFound: executionResult.totalFound || 0,
          totalItemsNow: previousContext.totalFound + (executionResult.totalFound || 0),
          executionTime: executionResult.executionTime || 0,
          errors: executionResult.errors || []
        }
      })

    } catch (executionError) {
      console.error('❌ Retry execution failed:', executionError)
      
      // Update job status to failed
      await db.updateScrapingJob(jobId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: [executionError instanceof Error ? executionError.message : String(executionError)]
      })

      return NextResponse.json({
        success: false,
        jobId: jobId,
        error: 'Retry execution failed',
        details: executionError instanceof Error ? executionError.message : String(executionError)
      }, { status: 500 })
    }

  } catch (error) {
    console.error('❌ Retry API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

