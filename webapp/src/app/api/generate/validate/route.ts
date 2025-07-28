import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { createOrchestrator } from '@/lib/codegen/orchestrator'
import { ScrapingRequest } from '@/lib/codegen/types'

export async function POST(request: NextRequest) {
  try {
    const { scriptId, jobId, userFeedback, isCorrect } = await request.json()
    
    if (!scriptId || !jobId) {
      return NextResponse.json({ 
        error: 'Script ID and Job ID are required' 
      }, { status: 400 })
    }

    console.log('🔍 Processing micro-test validation...')
    console.log(`📝 Script ID: ${scriptId}`)
    console.log(`✅ User says data is correct: ${isCorrect}`)
    console.log(`💬 User feedback: ${userFeedback || 'None'}`)

    // Get the original script and job
    const script = await db.getScraperScript(scriptId)
    const job = await db.getScrapingJob(jobId)
    
    if (!script || !job) {
      return NextResponse.json({
        error: 'Script or job not found'
      }, { status: 404 })
    }

    if (isCorrect) {
      // User confirmed the data is correct - proceed to execution
      console.log('✅ User validated data - proceeding to full execution')
      
      return NextResponse.json({
        success: true,
        validated: true,
        message: 'Data validated - ready for full execution',
        jobId: jobId,
        title: script.title,
        code: script.generated_code,
        explanation: script.explanation
      })
    } else {
      // User says data is wrong - regenerate with feedback
      console.log('❌ User rejected data - regenerating with feedback')
      
      const orchestrator = createOrchestrator({
        maxRefinementAttempts: 2,
        testTimeout: 30000
      })

      // Create enhanced prompt with user feedback
      const enhancedPrompt = `${script.prompt}

MICRO-TEST FEEDBACK FROM USER:
The initial extraction found data, but it was incorrect. User feedback: "${userFeedback || 'The extracted data is not what I wanted'}"

Please regenerate the scraper to extract the correct data based on this feedback. Focus on finding the right selectors and data sources.`

      // Create new scraping request with feedback
      const scrapingRequest: ScrapingRequest = {
        url: job.url,
        prompt: enhancedPrompt
      }

      // Execute regeneration pipeline
      const newCodegenJob = await orchestrator.executeCodegenPipeline(scrapingRequest)

      if (!newCodegenJob.script || !newCodegenJob.requirements) {
        throw new Error('Code regeneration failed')
      }

      console.log('✅ New code generated with user feedback')
      
      // Test the new script
      const testResults = await orchestrator.testAndClarify(newCodegenJob, scrapingRequest)

      // Save the NEW script
      const newScript = await db.createScraperScript({
        title: `${newCodegenJob.title} (Refined)`,
        prompt: enhancedPrompt,
        url: job.url,
        generated_code: newCodegenJob.script.code,
        requirements: newCodegenJob.requirements,
        tool_type: newCodegenJob.script.toolType,
        output_schema: newCodegenJob.requirements.outputFields,
        explanation: newCodegenJob.script.explanation,
        dependencies: newCodegenJob.script.dependencies
      })

      // Update the job to reference the new script
      await db.updateScrapingJob(jobId, {
        script_id: newScript.id,
        title: newCodegenJob.title
      })

      if (testResults.needsValidation) {
        // New script also needs validation
        return NextResponse.json({
          success: false,
          needsValidation: true,
          jobId: jobId,
          scriptId: newScript.id,
          title: newCodegenJob.title,
          code: newCodegenJob.script.code,
          explanation: newCodegenJob.script.explanation,
          testResult: testResults.testResult,
          sampleData: testResults.testResult.data || [],
          message: 'Generated new script based on your feedback - please validate again'
        })
      } else if (testResults.shouldProceed) {
        // New script passed - ready for execution
        return NextResponse.json({
          success: true,
          validated: true,
          jobId: jobId,
          title: newCodegenJob.title,
          code: newCodegenJob.script.code,
          explanation: newCodegenJob.script.explanation,
          message: 'Successfully regenerated script based on your feedback'
        })
      } else {
        // New script failed - return clarifying questions
        return NextResponse.json({
          success: false,
          needsClarification: true,
          jobId: jobId,
          scriptId: newScript.id,
          clarifyingQuestions: testResults.clarifyingQuestions,
          testResult: testResults.testResult
        })
      }
    }

  } catch (error) {
    console.error('❌ Validation API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
} 