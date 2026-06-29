import { NextRequest, NextResponse } from 'next/server'
import { applyPaymentOrderSuccess, getPaymentOrderByOutTradeNo } from '@/lib/payments/payment-order-service'
import { getZPayConfig, verifyZPaySign } from '@/lib/payments/zpay'
import { createAuditLog } from '@/lib/audit-log'

type CallbackParams = Record<string, string>

function plainText(text: string, status = 200) {
  return new NextResponse(text, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

async function parseParams(request: NextRequest): Promise<CallbackParams> {
  if (request.method === 'GET') {
    return Object.fromEntries(request.nextUrl.searchParams.entries())
  }

  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const json = (await request.json().catch(() => ({}))) as Record<string, unknown>
    return Object.fromEntries(Object.entries(json).map(([k, v]) => [k, String(v ?? '')]))
  }

  const formData = await request.formData().catch(() => null)
  if (!formData) return {}

  const entries: CallbackParams = {}
  for (const [key, value] of Array.from(formData.entries())) {
    entries[key] = String(value ?? '')
  }
  return entries
}

async function handleNotify(request: NextRequest) {
  try {
    const params = await parseParams(request)
    const { pid, key } = getZPayConfig()
    const sign = params.sign || ''

    if (!sign) return plainText('fail', 400)
    if ((params.pid || '').trim() !== pid) return plainText('fail', 400)
    if (!verifyZPaySign(params, key, sign)) return plainText('fail', 400)

    const outTradeNo = (params.out_trade_no || '').trim()
    const tradeStatus = (params.trade_status || '').trim()
    const tradeNo = (params.trade_no || '').trim()
    const paidAmount = Math.round(Number((params.money || '').trim()) * 100)

    if (!outTradeNo || !Number.isFinite(paidAmount) || paidAmount <= 0) {
      return plainText('fail', 400)
    }

    const order = await getPaymentOrderByOutTradeNo(outTradeNo)
    if (!order) {
      return plainText('success')
    }

    await createAuditLog({
      targetUserId: order.userId,
      action: 'payment.notify_received',
      resourceType: 'payment_order',
      resourceId: order.id,
      metadata: params,
    })

    if (tradeStatus !== 'TRADE_SUCCESS') {
      return plainText('success')
    }

    await applyPaymentOrderSuccess({
      outTradeNo,
      providerOrderId: tradeNo || undefined,
      paidAmountFen: paidAmount,
      notifyPayload: params,
      paidAt: new Date(),
    })

    return plainText('success')
  } catch {
    return plainText('fail', 500)
  }
}

export async function GET(request: NextRequest) {
  return handleNotify(request)
}

export async function POST(request: NextRequest) {
  return handleNotify(request)
}
