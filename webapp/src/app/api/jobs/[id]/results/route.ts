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
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '100')
    const offset = parseInt(searchParams.get('offset') || '0')

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID is required' }, { status: 400 })
    }

    // Get unified results (both legacy companies and flexible data)
    const results = await db.getJobResults(jobId)
    
    // Apply pagination if requested
    const paginatedResults = results.slice(offset, offset + limit)

    return NextResponse.json({
      results: paginatedResults,
      total: results.length,
      limit,
      offset
    })
  } catch (error) {
    console.error('❌ Failed to fetch job results:', error)
    return NextResponse.json({
      error: 'Failed to fetch job results',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
} 