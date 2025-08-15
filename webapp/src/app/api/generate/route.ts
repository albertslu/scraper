import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { createOrchestrator } from '@/lib/codegen/orchestrator'
import { ScrapingRequest } from '@/lib/codegen/types'

export async function POST(request: NextRequest) {
  try {
    const { prompt, url, clarifications } = await request.json()
    
    if (!prompt || !url) {
      return NextResponse.json({ 
        error: 'Both prompt and URL are required' 
      }, { status: 400 })
    }

    console.log('🚀 Starting code generation...')
    console.log('📋 Prompt:', prompt)
    console.log('🌐 URL:', url)
    if (clarifications) {
      console.log('💬 User clarifications:', clarifications)
    }

    // Create a pending job immediately so we can deep-link even if user navigates away
    const initialJob = await db.createScrapingJob(url, {
      prompt,
      title: 'Generating…'
    })

    // Create orchestrator instance
    const orchestrator = createOrchestrator({
      maxRefinementAttempts: 2,
      testTimeout: 30000
    })

    // Fetch full page HTML once and pass as context
    let pageHtml: string | undefined
    try {
      const res = await fetch(url, { method: 'GET' })
      pageHtml = await res.text()
    } catch {}

    // Create scraping request with clarifications and full page HTML
    const scrapingRequest: ScrapingRequest = {
      url,
      prompt: clarifications ? `${prompt}\n\nUser clarifications: ${JSON.stringify(clarifications)}` : prompt,
      retryContext: pageHtml ? {
        previousAttempt: {
          totalFound: 0,
          expectedItems: 0,
          issues: ['initial generation'],
          sampleData: [],
          previousToolType: 'unknown',
          previousCode: ''
        },
        retryStrategy: ['initial generation'],
        isRetry: false,
        pageHtml
      } : undefined
    }

    // Execute the code generation pipeline
    const codegenJob = await orchestrator.executeCodegenPipeline(scrapingRequest)

    if (!codegenJob.script || !codegenJob.requirements) {
      throw new Error('Code generation failed - no script or requirements generated')
    }

    console.log('✅ Code generated, now testing...')

    // Test the script first (Canvas approach)
    const testResults = await orchestrator.testAndClarify(codegenJob, scrapingRequest)

    if (testResults.needsValidation) {
      console.log('🔍 Micro-test found data - showing to user for validation')
      
      // Save the script for potential use after validation
      const savedScript = await db.createScraperScript({
        title: `${codegenJob.title} (Needs Validation)`,
        prompt: prompt,
        url: url,
        generated_code: codegenJob.script.code,
        requirements: codegenJob.requirements,
        tool_type: codegenJob.script.toolType,
        output_schema: codegenJob.requirements.outputFields,
        explanation: codegenJob.script.explanation,
        dependencies: codegenJob.script.dependencies
      })

      // Link pre-created job to the script and update title
      await db.updateScrapingJob(initialJob.id, {
        script_id: savedScript.id,
        title: codegenJob.title
      })

      return NextResponse.json({
        success: false, // Don't auto-proceed to execution
        needsValidation: true,
        jobId: initialJob.id,
        scriptId: savedScript.id,
        title: codegenJob.title,
        code: codegenJob.script.code,
        explanation: codegenJob.script.explanation,
        testResult: testResults.testResult,
        sampleData: testResults.testResult.data || []
      })
    } else if (!testResults.shouldProceed) {
      console.log('🤔 Test failed, returning clarifying questions to user')
      
      // Save the script for potential use after clarification
      const savedScript = await db.createScraperScript({
        title: `${codegenJob.title} (Needs Clarification)`,
        prompt: prompt,
        url: url,
        generated_code: codegenJob.script.code,
        requirements: codegenJob.requirements,
        tool_type: codegenJob.script.toolType,
        output_schema: codegenJob.requirements.outputFields,
        explanation: codegenJob.script.explanation,
        dependencies: codegenJob.script.dependencies
      })

      // Persist clarifying context for resume
      await db.updateScrapingJob(initialJob.id, {
        clarifying_context: {
          clarifyingQuestions: testResults.clarifyingQuestions,
          testResult: testResults.testResult,
          codePreview: codegenJob.script.code,
          title: codegenJob.title
        }
      })

      return NextResponse.json({
        success: false,
        needsClarification: true,
        jobId: initialJob.id,
        // Link pre-created job to the script and update title
        ...(await (async () => { await db.updateScrapingJob(initialJob.id, { script_id: savedScript.id, title: codegenJob.title }); return {}; })()),
        scriptId: savedScript.id,
        title: codegenJob.title,
        testResult: testResults.testResult,
        clarifyingQuestions: testResults.clarifyingQuestions,
        code: codegenJob.script.code,
        explanation: codegenJob.script.explanation
      })
    }

    console.log('✅ Test passed! Saving script and creating job...')

    // Save the generated script to database
    const savedScript = await db.createScraperScript({
      title: codegenJob.title,
      prompt: prompt,
      url: url,
      generated_code: codegenJob.script.code,
      requirements: codegenJob.requirements,
      tool_type: codegenJob.script.toolType,
      output_schema: codegenJob.requirements.outputFields,
      explanation: codegenJob.script.explanation,
      dependencies: codegenJob.script.dependencies
    })

    // Link pre-created job to this script and update title
    await db.updateScrapingJob(initialJob.id, {
      title: codegenJob.title,
      script_id: savedScript.id
    })

    console.log('✅ Code generation completed successfully!')
    console.log('📝 Script ID:', savedScript.id)
    console.log('🎯 Job ID:', initialJob.id)

    return NextResponse.json({
      success: true,
      jobId: initialJob.id,
      scriptId: savedScript.id,
      title: codegenJob.title,
      code: codegenJob.script.code,
      explanation: codegenJob.script.explanation,
      outputFields: codegenJob.requirements.outputFields,
      toolType: codegenJob.script.toolType,
      testResult: testResults.testResult
    })

  } catch (error) {
    console.error('💥 Code generation failed:', error)

    return NextResponse.json({
      success: false,
      error: 'Code generation failed',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
} 