import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/auth/request-auth'
import { settlePaymentOrderManually } from '@/lib/payments/payment-order-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) return result.error

    const { id } = await params
    await settlePaymentOrderManually({
      orderId: id,
      adminUserId: result.auth.userId,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
