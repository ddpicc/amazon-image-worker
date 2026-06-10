import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/auth/request-auth'
import { getUsageHistory } from '@/lib/billing/billing-service'

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }

    const { searchParams } = request.nextUrl
    const userId = searchParams.get('userId') || undefined
    const apiKeyId = searchParams.get('apiKeyId') || undefined
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    const data = await getUsageHistory({
      userId,
      apiKeyId,
      from: fromParam ? new Date(fromParam) : undefined,
      to: toParam ? new Date(toParam) : undefined,
      page,
      limit,
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
