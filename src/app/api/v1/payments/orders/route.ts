import { NextRequest, NextResponse } from 'next/server'
import { PaymentOrderStatus } from '@prisma/client'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import {
  createPendingPaymentOrder,
  listPaymentOrders,
  updatePaymentOrderAfterCreate,
} from '@/lib/payments/payment-order-service'
import { buildZPaySign, getZPayConfig, normalizeMoneyFromFen, parseZPayCode } from '@/lib/payments/zpay'
import { fenToYuan, parseYuanToFen } from '@/lib/money'
import { getClientIp } from '@/lib/rate-limit'
import { createAuditLog } from '@/lib/audit-log'

type CreateOrderBody = {
  packageId?: string
  amountYuan?: string
}

type ZPayCreateResponse = {
  code?: number | string
  msg?: string
  O_id?: string
  trade_no?: string
  payurl?: string
  payurl2?: string
  qrcode?: string
  img?: string
  [key: string]: unknown
}

function makeOutTradeNo() {
  const ts = Date.now().toString()
  const rand = Math.floor(Math.random() * 900000 + 100000).toString()
  return `PO${ts}${rand}`.slice(0, 32)
}

export async function GET(request: NextRequest) {
  try {
    const result = await requireRequestAuth(request)
    if ('error' in result) {
      return result.error
    }
    if (result.auth.authType !== 'session') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const status = request.nextUrl.searchParams.get('status')
    const orders = await listPaymentOrders({
      userId: result.auth.userId,
      status: status && status in PaymentOrderStatus ? status as PaymentOrderStatus : undefined,
      limit: 50,
    })

    return NextResponse.json({
      orders: orders.map((order) => ({
        ...order,
        amount: fenToYuan(order.amountFen),
        credit: fenToYuan(order.creditFen),
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requireRequestAuth(request)
    if ('error' in result) {
      return result.error
    }
    if (result.auth.authType !== 'session') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as CreateOrderBody
    const packageId = typeof body.packageId === 'string' ? body.packageId.trim() : ''
    const amountYuan = typeof body.amountYuan === 'string' ? body.amountYuan.trim() : ''

    if (packageId && amountYuan) {
      return NextResponse.json({ error: '请只选择套餐充值或自由充值其中一种方式' }, { status: 400 })
    }

    if (!packageId && !amountYuan) {
      return NextResponse.json({ error: '请选择充值套餐或输入充值金额' }, { status: 400 })
    }

    const outTradeNo = makeOutTradeNo()
    const localOrder = packageId
      ? await createPendingPaymentOrder({
          userId: result.auth.userId,
          packageId,
          outTradeNo,
          payType: 'wxpay',
          provider: 'zpay',
        })
      : await createPendingPaymentOrder({
          userId: result.auth.userId,
          amountFen: parseYuanToFen(amountYuan),
          outTradeNo,
          payType: 'wxpay',
          provider: 'zpay',
        })

    const money = normalizeMoneyFromFen(localOrder.amountFen)
    const productName = process.env.ZPAY_PRODUCT_NAME?.trim() || localOrder.topupPackage?.name || '自由充值'
    const origin = (process.env.APP_BASE_URL?.trim() || request.nextUrl.origin).replace(/\/+$/, '')
    const notifyUrl = process.env.ZPAY_NOTIFY_URL?.trim() || `${origin}/api/v1/payments/orders/notify`
    const { pid, key, gateway } = getZPayConfig()

    const basePayload: Record<string, string> = {
      pid,
      type: 'wxpay',
      out_trade_no: outTradeNo,
      notify_url: notifyUrl,
      name: productName,
      money,
      clientip: getClientIp(request),
      param: result.auth.userId,
    }

    const zpayPayload = {
      ...basePayload,
      sign: buildZPaySign(basePayload, key),
      sign_type: 'MD5',
    }

    const formData = new FormData()
    for (const [k, v] of Object.entries(zpayPayload)) {
      formData.append(k, v)
    }

    const upstream = await fetch(`${gateway}/mapi.php`, {
      method: 'POST',
      body: formData,
      cache: 'no-store',
    })
    const raw = await upstream.text()

    let data: ZPayCreateResponse = {}
    try {
      data = JSON.parse(raw) as ZPayCreateResponse
    } catch {
      data = {
        code: 0,
        msg: raw.slice(0, 500) || 'ZPAY 返回格式不正确',
      }
    }

    const code = parseZPayCode(data.code)
    const order = await updatePaymentOrderAfterCreate({
      outTradeNo,
      status: code === 1 ? PaymentOrderStatus.PENDING : PaymentOrderStatus.FAILED,
      providerOrderId: typeof data.trade_no === 'string' ? data.trade_no : null,
      payUrl: typeof data.payurl === 'string' ? data.payurl : '',
      payUrl2: typeof data.payurl2 === 'string' ? data.payurl2 : '',
      qrcodeUrl: typeof data.qrcode === 'string' ? data.qrcode : '',
      qrcodeImg: typeof data.img === 'string' ? data.img : '',
      metadata: {
        packageName: localOrder.topupPackage?.name || '自由充值',
        ...(localOrder.packageId ? { packageId: localOrder.packageId } : { source: 'custom_topup' }),
        zpayPayload: data,
      },
    })

    await createAuditLog({
      actorUserId: result.auth.userId,
      targetUserId: result.auth.userId,
      action: 'payment.order_created',
      resourceType: 'payment_order',
      resourceId: order.id,
      ip: getClientIp(request),
      metadata: {
        outTradeNo,
        packageId: localOrder.packageId,
        source: localOrder.packageId ? 'package_topup' : 'custom_topup',
        amountFen: order.amountFen,
        providerOrderId: order.providerOrderId,
      },
    })

    if (code !== 1) {
      return NextResponse.json(
        { error: typeof data.msg === 'string' ? data.msg : '拉起支付失败', outTradeNo },
        { status: 502 },
      )
    }

    return NextResponse.json({
      id: order.id,
      outTradeNo: order.outTradeNo,
      status: order.status,
      amountFen: order.amountFen,
      amount: fenToYuan(order.amountFen),
      creditFen: order.creditFen,
      credit: fenToYuan(order.creditFen),
      currency: order.currency,
      payType: order.payType,
      payUrl: order.payUrl,
      payUrl2: order.payUrl2,
      qrcode: order.qrcodeUrl,
      img: order.qrcodeImg,
      providerOrderId: order.providerOrderId,
      createdAt: order.createdAt,
      topupPackage: localOrder.topupPackage
        ? {
            id: localOrder.topupPackage.id,
            name: localOrder.topupPackage.name,
            priceFen: localOrder.topupPackage.priceFen,
            price: fenToYuan(localOrder.topupPackage.priceFen),
            creditFen: localOrder.topupPackage.creditFen,
            bonusFen: localOrder.topupPackage.bonusFen,
          }
        : null,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '创建充值订单失败' },
      { status: 400 },
    )
  }
}
