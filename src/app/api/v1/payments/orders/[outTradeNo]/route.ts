import { NextRequest, NextResponse } from 'next/server'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { getPaymentOrderForUser } from '@/lib/payments/payment-order-service'
import { fenToYuan } from '@/lib/money'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ outTradeNo: string }> },
) {
  try {
    const result = await requireRequestAuth(request)
    if ('error' in result) return result.error
    if (result.auth.authType !== 'session') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { outTradeNo } = await params
    const order = await getPaymentOrderForUser({
      userId: result.auth.userId,
      outTradeNo,
    })

    if (!order) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 })
    }

    return NextResponse.json({
      order: {
        ...order,
        amount: fenToYuan(order.amountFen),
        credit: fenToYuan(order.creditFen),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
