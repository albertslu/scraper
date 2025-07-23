import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'

interface RouteParams {
  params: {
    id: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params
    const jobId = id

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 })
    }

    // Get job with associated script
    const result = await db.getJobWithScript(jobId)
    
    if (!result) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Format the response with job details and output schema
    const response = {
      job: {
        id: result.job.id,
        title: result.job.title,
        prompt: result.job.prompt,
        url: result.job.url,
        status: result.job.status,
        total_items: result.job.total_items || result.job.total_companies, // Fallback for legacy
        job_type: result.script ? 'flexible' : 'legacy',
        output_schema: result.script?.output_schema
      }
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('❌ Failed to fetch job details:', error)
    return NextResponse.json({
      error: 'Failed to fetch job details',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const jobId = params.id
    const updates = await request.json()

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 })
    }

    // Update the job
    const updatedJob = await db.updateScrapingJob(jobId, updates)

    return NextResponse.json({
      success: true,
      job: updatedJob
    })
  } catch (error) {
    console.error('❌ Failed to update job:', error)
    return NextResponse.json({
      error: 'Failed to update job',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
} 