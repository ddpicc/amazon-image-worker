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
    const from = fromParam ? new Date(fromParam) : undefined
    const to = toParam ? new Date(toParam) : undefined

    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      return NextResponse.json({ error: '日期参数不合法' }, { status: 400 })
    }
    if (from && to && from > to) {
      return NextResponse.json({ error: '开始日期不能晚于结束日期' }, { status: 400 })
    }

    const data = await getUsageHistory({
      userId: auth.role === 'ADMIN' ? (searchParams.get('userId') || undefined) : auth.userId,
      apiKeyId: searchParams.get('apiKeyId') || undefined,
      from,
      to,
      includePrompt: auth.role === 'ADMIN',
      page,
      limit,
    })

    return NextResponse.json(data)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
