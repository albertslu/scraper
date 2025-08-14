import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { authenticateExternalApi } from '@/lib/api/auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticateExternalApi(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const job = await db.getScrapingJob(params.id)
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ job })
}


