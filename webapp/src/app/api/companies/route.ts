import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')
    const search = searchParams.get('search')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    let companies

    if (jobId) {
      // Get companies for a specific job
      companies = await db.getCompaniesByJob(jobId)
    } else if (search) {
      // Search companies by name
      companies = await db.searchCompanies(search, limit)
    } else {
      // Get all companies with pagination
      companies = await db.getAllCompanies(limit, offset)
    }

    return NextResponse.json({ companies })
  } catch (error) {
    console.error('❌ Failed to fetch companies:', error)
    return NextResponse.json({
      error: 'Failed to fetch companies',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
} 