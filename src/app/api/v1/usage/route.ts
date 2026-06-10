import { NextRequest, NextResponse } from 'next/server'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { getUsageHistory } from '@/lib/billing/billing-service'

export async function GET(request: NextRequest) {
  try {
    const result = await requireRequestAuth(request)
    if ('error' in result) {
      return result.error
    }

    const { auth } = result
    const { searchParams } = request.nextUrl
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const fromParam = searchParams.get('from')
    const toParam = searchParams.get('to')

    const data = await getUsageHistory({
      userId: auth.role === 'ADMIN' ? (searchParams.get('userId') || undefined) : auth.userId,
      apiKeyId: searchParams.get('apiKeyId') || undefined,
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
