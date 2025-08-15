import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { createOrchestrator } from '@/lib/codegen/orchestrator'
import { ScrapingRequest } from '@/lib/codegen/types'

export async function POST(request: NextRequest) {
  try {
    const { scriptId, clarifications, originalPrompt, url } = await request.json()
    
    if (!scriptId || !clarifications || !originalPrompt || !url) {
      return NextResponse.json({ 
        error: 'Script ID, clarifications, original prompt, and URL are required' 
      }, { status: 400 })
    }

    console.log('🔄 Regenerating script with user clarifications...')
    console.log('📝 Script ID:', scriptId)
    console.log('💬 Clarifications:', clarifications)

    // Create orchestrator instance
    const orchestrator = createOrchestrator({
      maxRefinementAttempts: 2,
      testTimeout: 30000
    })

    // Create enhanced prompt with clarifications
    const enhancedPrompt = `${originalPrompt}

User Clarifications:
${Object.entries(clarifications).map(([question, answer]) => 
  `Q: ${question}
A: ${answer}`
).join('\n\n')}`

    // Load existing script to include previous code context
    const existingScript = await db.getScraperScript(scriptId)

    // Fetch full page HTML context
    let pageHtml: string | undefined
    try {
      const res = await fetch(url, { method: 'GET' })
      pageHtml = await res.text()
    } catch (e) {
      // Non-fatal; continue without full HTML context
    }

    // Create scraping request with clarifications and previous code context
    const scrapingRequest: ScrapingRequest = {
      url,
      prompt: enhancedPrompt,
      retryContext: existingScript ? {
        previousAttempt: {
          totalFound: 0,
          expectedItems: 0,
          issues: ["Regeneration with user clarifications"],
          sampleData: [],
          previousToolType: existingScript.tool_type,
          previousCode: existingScript.generated_code
        },
        retryStrategy: ["Incorporate user clarifications into the original approach", "Fix issues rather than full rewrite if possible"],
        isRetry: true,
        pageHtml
      } : undefined
    }

    // Execute the code generation pipeline with clarifications
    const codegenJob = await orchestrator.executeCodegenPipeline(scrapingRequest)

    if (!codegenJob.script || !codegenJob.requirements) {
      throw new Error('Code generation failed - no script or requirements generated')
    }

    console.log('✅ Code regenerated with clarifications, now testing...')

    // Test the refined script
    const testResults = await orchestrator.testAndClarify(codegenJob, scrapingRequest)

    if (testResults.needsValidation) {
      console.log('🔍 Refined script found data - needs user validation')
      
      // Update the existing script with new code
      await db.updateScraperScript(scriptId, {
        title: codegenJob.title,
        generated_code: codegenJob.script.code,
        requirements: codegenJob.requirements,
        tool_type: codegenJob.script.toolType,
        output_schema: codegenJob.requirements.outputFields,
        explanation: codegenJob.script.explanation,
        dependencies: codegenJob.script.dependencies
      })

      // Create a scraping job linked to this script and clear clarifying context
      const scrapingJob = await db.createScrapingJob(url, {
        prompt: enhancedPrompt,
        title: codegenJob.title,
        script_id: scriptId
      })
      await db.updateScrapingJob(scrapingJob.id, { clarifying_context: null as any })

      return NextResponse.json({
        success: false, // Don't auto-proceed
        needsValidation: true,
        jobId: scrapingJob.id,
        scriptId: scriptId,
        title: codegenJob.title,
        code: codegenJob.script.code,
        previousCode: existingScript?.generated_code,
        explanation: codegenJob.script.explanation,
        testResult: testResults.testResult,
        sampleData: testResults.testResult.data || [],
        message: 'Regenerated script found data - please validate'
      })
    } else if (!testResults.shouldProceed) {
      console.log('🤔 Test still failed after clarifications, returning more questions')
      
      return NextResponse.json({
        success: false,
        needsClarification: true,
        scriptId: scriptId,
        title: codegenJob.title,
        testResult: testResults.testResult,
        clarifyingQuestions: testResults.clarifyingQuestions,
        code: codegenJob.script.code,
        previousCode: existingScript?.generated_code,
        explanation: codegenJob.script.explanation,
        attempt: 2
      })
    }

    console.log('✅ Test passed! Updating script and creating job...')

    // Update the existing script with new code
    await db.updateScraperScript(scriptId, {
      title: codegenJob.title,
      generated_code: codegenJob.script.code,
      requirements: codegenJob.requirements,
      tool_type: codegenJob.script.toolType,
      output_schema: codegenJob.requirements.outputFields,
      explanation: codegenJob.script.explanation,
      dependencies: codegenJob.script.dependencies
    })

    // Create a scraping job linked to this script and clear clarifying context
    const scrapingJob = await db.createScrapingJob(url, {
      prompt: enhancedPrompt,
      title: codegenJob.title,
      script_id: scriptId
    })
    await db.updateScrapingJob(scrapingJob.id, { clarifying_context: null as any })

    console.log('✅ Script clarification completed successfully!')
    console.log('🎯 Job ID:', scrapingJob.id)

    return NextResponse.json({
      success: true,
      jobId: scrapingJob.id,
      scriptId: scriptId,
      title: codegenJob.title,
      code: codegenJob.script.code,
      explanation: codegenJob.script.explanation,
      outputFields: codegenJob.requirements.outputFields,
      toolType: codegenJob.script.toolType,
      testResult: testResults.testResult
    })

  } catch (error) {
    console.error('💥 Script clarification failed:', error)
    
    return NextResponse.json({
      success: false,
      error: 'Script clarification failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
} 