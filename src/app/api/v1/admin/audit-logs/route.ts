import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/auth/request-auth'
import { listAuditLogs } from '@/lib/audit-log'

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) return result.error

    const q = request.nextUrl.searchParams.get('q') || undefined
    const logs = await listAuditLogs({
      q,
      limit: 100,
    })

    return NextResponse.json({ logs })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
