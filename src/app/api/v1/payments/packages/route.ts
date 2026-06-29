import { NextRequest, NextResponse } from 'next/server'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { listEnabledTopupPackages } from '@/lib/payments/payment-order-service'
import { fenToYuan } from '@/lib/money'

export async function GET(request: NextRequest) {
  try {
    const result = await requireRequestAuth(request)
    if ('error' in result) {
      return result.error
    }
    if (result.auth.authType !== 'session') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const packages = await listEnabledTopupPackages()
    return NextResponse.json({
      packages: packages.map((item) => ({
        ...item,
        price: fenToYuan(item.priceFen),
        credit: fenToYuan(item.creditFen),
        bonus: fenToYuan(item.bonusFen),
        totalCredit: fenToYuan(item.creditFen + item.bonusFen),
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
