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
  `Q: ${question}\nA: ${answer}`
).join('\n\n')}`

    // Load existing script to include previous code context
    const existingScript = await db.getScraperScript(scriptId)

    // Build lightweight JSON page hints (title, pagination flags/labels, compact DOM digest)
    let pageHints: ScrapingRequest['retryContext'] extends infer T ? T extends { pageHints: infer U } ? U : any : any
    try {
      const res = await fetch(url, { method: 'GET' })
      const html = await res.text()
      const lower = html.toLowerCase()

      // Title
      const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i)
      const pageTitle = titleMatch?.[1]?.trim()

      // Pagination labels
      const labels: string[] = []
      if (lower.includes('load more')) labels.push('load more')
      if (lower.includes('show more')) labels.push('show more')
      if (lower.includes('next')) labels.push('next')
      if (lower.includes('prev')) labels.push('prev')
      if (lower.match(/page\s*\d+/)) labels.push('page N')

      // Compact DOM digest: top class/id names (regex based)
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
        domDigest: {
          commonClasses,
          commonIds
        },
        contentLength: html.length
      }
    } catch (e) {
      // Non-fatal; continue without hints
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
        pageHints
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