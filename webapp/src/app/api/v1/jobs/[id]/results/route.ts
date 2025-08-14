import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { authenticateExternalApi } from '@/lib/api/auth'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = authenticateExternalApi(req.headers.get('authorization'))
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const rows = await db.getJobResults(params.id)
  return NextResponse.json({ items: rows })
}


