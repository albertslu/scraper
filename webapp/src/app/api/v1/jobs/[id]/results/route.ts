import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { authenticateExternalApi } from '@/lib/api/auth'

export async function GET(req: NextRequest) {
  const auth = authenticateExternalApi(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const match = req.url.match(/\/api\/v1\/jobs\/([^/]+)/)
  const jobId = match?.[1]
  if (!jobId) return NextResponse.json({ error: 'Missing job id' }, { status: 400 })

  const rows = await db.getJobResults(jobId)
  return NextResponse.json({ items: rows })
}


