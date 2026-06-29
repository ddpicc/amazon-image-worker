import { NextRequest, NextResponse } from 'next/server'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { applyPaymentOrderSuccess, getPaymentOrderForUser } from '@/lib/payments/payment-order-service'
import { getZPayConfig } from '@/lib/payments/zpay'
import { fenToYuan } from '@/lib/money'

type ZPayOrderQueryResponse = {
  code?: number | string
  msg?: string
  trade_no?: string
  money?: string | number
  status?: string | number
}

export async function POST(
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
    const localOrder = await getPaymentOrderForUser({
      userId: result.auth.userId,
      outTradeNo,
    })
    if (!localOrder) {
      return NextResponse.json({ error: '订单不存在' }, { status: 404 })
    }

    if (localOrder.status === 'PAID') {
      return NextResponse.json({
        order: {
          ...localOrder,
          amount: fenToYuan(localOrder.amountFen),
          credit: fenToYuan(localOrder.creditFen),
        },
        verified: true,
      })
    }

    const { pid, key, gateway } = getZPayConfig()
    const queryUrl = new URL(`${gateway}/api.php`)
    queryUrl.searchParams.set('act', 'order')
    queryUrl.searchParams.set('pid', pid)
    queryUrl.searchParams.set('key', key)
    queryUrl.searchParams.set('out_trade_no', outTradeNo)

    const upstream = await fetch(queryUrl.toString(), {
      method: 'GET',
      cache: 'no-store',
    })
    const rawText = await upstream.text()

    let remote: ZPayOrderQueryResponse = {}
    try {
      remote = JSON.parse(rawText) as ZPayOrderQueryResponse
    } catch {
      return NextResponse.json({ error: '查询上游订单状态失败' }, { status: 502 })
    }

    const code = Number(remote.code ?? 0)
    if (!Number.isFinite(code) || code !== 1) {
      return NextResponse.json({ error: String(remote.msg ?? '查询订单失败') }, { status: 502 })
    }

    const paidStatus = Number(remote.status ?? 0)
    if (paidStatus === 1) {
      const amountFen = Math.round(Number(remote.money ?? localOrder.amountFen / 100) * 100)
      if (!Number.isFinite(amountFen) || amountFen <= 0) {
        return NextResponse.json({ error: '上游返回金额不合法' }, { status: 502 })
      }

      await applyPaymentOrderSuccess({
        outTradeNo,
        providerOrderId: String(remote.trade_no ?? '').trim() || undefined,
        paidAmountFen: amountFen,
        notifyPayload: {
          source: 'manual_order_query',
          queriedAt: new Date().toISOString(),
          remote,
        },
        paidAt: new Date(),
      })
    }

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
      verified: paidStatus === 1,
      remoteStatus: paidStatus,
      remoteMsg: String(remote.msg ?? ''),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '查询订单状态失败' },
      { status: 500 },
    )
  }
}
