import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { scrapeBBB } from '@/lib/scraper'
import { createOrchestrator } from '@/lib/codegen/orchestrator'

export async function POST(request: NextRequest) {
  try {
    const { url, jobId, executeGenerated } = await request.json()
    
    // Handle generated code execution
    if (executeGenerated && jobId) {
      return await executeGeneratedScraper(jobId)
    }
    
    // Handle legacy BBB scraping (backwards compatibility)
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Validate BBB URL format for legacy mode
    if (!url.includes('bbb.org')) {
      return NextResponse.json({ 
        error: 'Please provide a valid BBB search URL' 
      }, { status: 400 })
    }

    console.log('🚀 Starting legacy BBB scraping job for URL:', url)

    // Create a new legacy scraping job in the database
    const job = await db.createScrapingJob(url)
    console.log('📝 Created scraping job:', job.id)

    // Update job status to running
    await db.updateScrapingJob(job.id, { 
      status: 'running' 
    })

    try {
      // Run the legacy BBB scraper
      console.log('🎬 Starting BBB scraper...')
      const result = await scrapeBBB(url, {
        totalPages: 3, // Limit pages for web app
        rateLimit: 1   // Faster for demo
      })

      console.log(`✅ Scraping completed: ${result.totalFound} companies found`)

      // Save companies to database (legacy format)
      if (result.companies.length > 0) {
        await db.insertCompanies(job.id, result.companies)
        console.log('💾 Companies saved to database')
      }

      // Update job status to completed
      await db.updateScrapingJob(job.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_companies: result.totalFound,
        total_items: result.totalFound,
        execution_time: result.executionTime,
        errors: result.errors.length > 0 ? result.errors : undefined
      })

      return NextResponse.json({
        success: true,
        jobId: job.id,
        result: {
          totalFound: result.totalFound,
          executionTime: result.executionTime,
          errors: result.errors
        }
      })

    } catch (scraperError) {
      console.error('❌ Scraper failed:', scraperError)
      
      // Update job status to failed
      await db.updateScrapingJob(job.id, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: [scraperError instanceof Error ? scraperError.message : String(scraperError)]
      })

      return NextResponse.json({
        success: false,
        jobId: job.id,
        error: 'Scraping failed',
        details: scraperError instanceof Error ? scraperError.message : String(scraperError)
      }, { status: 500 })
    }

  } catch (error) {
    console.error('❌ API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

// Handle execution of generated scrapers
async function executeGeneratedScraper(jobId: string) {
  try {
    console.log('🚀 Starting generated scraper execution for job:', jobId)

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
      // Create orchestrator for execution
      const orchestrator = createOrchestrator({
        maxRefinementAttempts: 1,
        testTimeout: 60000
      })

      console.log('🎬 Executing generated script...')
      console.log('🛠️ Tool type:', script.tool_type)

      // Execute the generated script
      const codegenJob = {
        id: jobId,
        request: { url: job.url, prompt: job.prompt || '' },
        script: {
          id: script.id,
          toolType: script.tool_type,
          code: script.generated_code,
          testCode: script.generated_code, // For now, use same code
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

      const executionResult = await orchestrator.executeScript(codegenJob, {
        timeout: 60000,
        maxRetries: 1
      })

      console.log(`✅ Execution completed: ${executionResult.totalFound} items found`)

      // Save flexible data to database
      if (executionResult.success && executionResult.data.length > 0) {
        await db.insertScrapedData(jobId, executionResult.data)
        console.log('💾 Flexible data saved to database')
      }

      // Update job status to completed
      await db.updateScrapingJob(jobId, {
        status: executionResult.success ? 'completed' : 'failed',
        completed_at: new Date().toISOString(),
        total_items: executionResult.totalFound || 0,
        execution_time: executionResult.executionTime || 0,
        errors: executionResult.errors && executionResult.errors.length > 0 ? executionResult.errors : undefined
      })

      return NextResponse.json({
        success: executionResult.success,
        jobId: jobId,
        result: {
          totalFound: executionResult.totalFound || 0,
          executionTime: executionResult.executionTime || 0,
          errors: executionResult.errors || []
        }
      })

    } catch (executionError) {
      console.error('❌ Generated scraper execution failed:', executionError)
      
      // Update job status to failed
      await db.updateScrapingJob(jobId, {
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors: [executionError instanceof Error ? executionError.message : String(executionError)]
      })

      return NextResponse.json({
        success: false,
        jobId: jobId,
        error: 'Generated scraper execution failed',
        details: executionError instanceof Error ? executionError.message : String(executionError)
      }, { status: 500 })
    }

  } catch (error) {
    console.error('❌ Generated scraper API error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    // Get recent scraping jobs
    const jobs = await db.getScrapingJobs(10)
    return NextResponse.json({ jobs })
  } catch (error) {
    console.error('❌ Failed to fetch jobs:', error)
    return NextResponse.json({
      error: 'Failed to fetch scraping jobs',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
} 