import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { scrapeBBB } from '@/lib/scraper'

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json()
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Validate BBB URL format
    if (!url.includes('bbb.org')) {
      return NextResponse.json({ 
        error: 'Please provide a valid BBB search URL' 
      }, { status: 400 })
    }

    console.log('🚀 Starting scraping job for URL:', url)

    // Create a new scraping job in the database
    const job = await db.createScrapingJob(url)
    console.log('📝 Created scraping job:', job.id)

    // Update job status to running
    await db.updateScrapingJob(job.id, { 
      status: 'running' 
    })

    try {
      // Run the scraper
      console.log('🎬 Starting scraper...')
      const result = await scrapeBBB(url, {
        totalPages: 3, // Limit pages for web app
        rateLimit: 1   // Faster for demo
      })

      console.log(`✅ Scraping completed: ${result.totalFound} companies found`)

      // Save companies to database
      if (result.companies.length > 0) {
        await db.insertCompanies(job.id, result.companies)
        console.log('💾 Companies saved to database')
      }

      // Update job status to completed
      await db.updateScrapingJob(job.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        total_companies: result.totalFound,
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