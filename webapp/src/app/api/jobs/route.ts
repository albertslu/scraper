import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Get unified job results (both legacy and flexible jobs)
    const { jobs, total } = await db.getScrapingJobs(limit, offset)
    
    return NextResponse.json({ 
      jobs,
      total,
      limit,
      offset
    })
  } catch (error) {
    console.error('❌ Failed to fetch jobs:', error)
    return NextResponse.json({
      error: 'Failed to fetch jobs',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url, prompt, title, script_id } = await request.json()
    
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    console.log('🚀 Creating new scraping job...')

    // Create a new scraping job with enhanced metadata
    const job = await db.createScrapingJob(url, {
      prompt,
      title,
      script_id
    })
    
    console.log('📝 Created scraping job:', job.id)

    return NextResponse.json({
      success: true,
      job
    })
  } catch (error) {
    console.error('❌ Failed to create job:', error)
    return NextResponse.json({
      error: 'Failed to create job',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
} 