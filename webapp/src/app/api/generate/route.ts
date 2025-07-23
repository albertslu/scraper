import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { createOrchestrator } from '@/lib/codegen/orchestrator'
import { ScrapingRequest } from '@/lib/codegen/types'

export async function POST(request: NextRequest) {
  try {
    const { prompt, url } = await request.json()
    
    if (!prompt || !url) {
      return NextResponse.json({ 
        error: 'Both prompt and URL are required' 
      }, { status: 400 })
    }

    console.log('🚀 Starting code generation...')
    console.log('📋 Prompt:', prompt)
    console.log('🌐 URL:', url)

    // Create orchestrator instance
    const orchestrator = createOrchestrator({
      maxRefinementAttempts: 2,
      testTimeout: 30000
    })

    // Create scraping request
    const scrapingRequest: ScrapingRequest = {
      url,
      prompt
    }

    // Execute the code generation pipeline
    const codegenJob = await orchestrator.executeCodegenPipeline(scrapingRequest)

    if (!codegenJob.script || !codegenJob.requirements) {
      throw new Error('Code generation failed - no script or requirements generated')
    }

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

    // Create a scraping job linked to this script
    const scrapingJob = await db.createScrapingJob(url, {
      prompt: prompt,
      title: codegenJob.title,
      script_id: savedScript.id
    })

    console.log('✅ Code generation completed successfully!')
    console.log('📝 Script ID:', savedScript.id)
    console.log('🎯 Job ID:', scrapingJob.id)

    return NextResponse.json({
      success: true,
      jobId: scrapingJob.id,
      scriptId: savedScript.id,
      title: codegenJob.title,
      code: codegenJob.script.code,
      explanation: codegenJob.script.explanation,
      outputFields: codegenJob.requirements.outputFields,
      toolType: codegenJob.script.toolType
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