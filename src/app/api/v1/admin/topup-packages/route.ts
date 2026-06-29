import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/auth/request-auth'
import { createTopupPackage, listAllTopupPackages, updateTopupPackage } from '@/lib/payments/payment-order-service'
import { fenToYuan, yuanToFen } from '@/lib/money'

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) return result.error

    const packages = await listAllTopupPackages()
    return NextResponse.json({
      packages: packages.map((item) => ({
        ...item,
        price: fenToYuan(item.priceFen),
        credit: fenToYuan(item.creditFen),
        bonus: fenToYuan(item.bonusFen),
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) return result.error

    const body = await request.json().catch(() => ({}))
    const rows = Array.isArray(body?.packages) ? body.packages : []
    const saved = []

    for (const row of rows) {
      if (typeof row?.name !== 'string' || typeof row?.price !== 'number' || typeof row?.credit !== 'number') {
        return NextResponse.json({ error: 'each package requires name, price, credit' }, { status: 400 })
      }

      if (typeof row?.id === 'string' && row.id) {
        saved.push(await updateTopupPackage({
          id: row.id,
          name: row.name.trim(),
          priceFen: yuanToFen(row.price),
          creditFen: yuanToFen(row.credit),
          bonusFen: typeof row.bonus === 'number' ? yuanToFen(row.bonus) : 0,
          enabled: typeof row.enabled === 'boolean' ? row.enabled : undefined,
          displayOrder: typeof row.displayOrder === 'number' ? row.displayOrder : undefined,
        }))
      } else {
        saved.push(await createTopupPackage({
          name: row.name.trim(),
          priceFen: yuanToFen(row.price),
          creditFen: yuanToFen(row.credit),
          bonusFen: typeof row.bonus === 'number' ? yuanToFen(row.bonus) : 0,
          displayOrder: typeof row.displayOrder === 'number' ? row.displayOrder : undefined,
        }))
      }
    }

    return NextResponse.json({
      packages: saved.map((item) => ({
        ...item,
        price: fenToYuan(item.priceFen),
        credit: fenToYuan(item.creditFen),
        bonus: fenToYuan(item.bonusFen),
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
