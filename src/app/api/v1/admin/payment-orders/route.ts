import { NextRequest, NextResponse } from 'next/server'
import { PaymentOrderStatus } from '@prisma/client'
import { requireAdminRequest } from '@/lib/auth/request-auth'
import { listPaymentOrders } from '@/lib/payments/payment-order-service'
import { fenToYuan } from '@/lib/money'

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) return result.error

    const q = request.nextUrl.searchParams.get('q') || undefined
    const status = request.nextUrl.searchParams.get('status')
    const orders = await listPaymentOrders({
      q,
      status: status && status in PaymentOrderStatus ? status as PaymentOrderStatus : undefined,
      limit: 100,
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
