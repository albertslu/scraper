import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { authenticateExternalApi } from '@/lib/api/auth'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticateExternalApi(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const jobId = params.id
  const { accepted } = await req.json().catch(() => ({}))
  if (typeof accepted !== 'boolean') return NextResponse.json({ error: 'accepted (boolean) required' }, { status: 400 })

  const result = await db.getJobWithScript(jobId)
  if (!result || !result.script) return NextResponse.json({ error: 'Job or script not found' }, { status: 404 })

  if (accepted) return NextResponse.json({ jobId, status: 'ready_to_execute' })
  // For now just indicate regeneration requested; client can call clarify or recreate
  return NextResponse.json({ jobId, status: 'waiting_for_regeneration' })
}


