import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/auth/request-auth'
import {
  batchSetSizePrices,
  ensureDefaultSizePrices,
  listSizePrices,
} from '@/lib/billing/price-service'

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }

    await ensureDefaultSizePrices(result.auth.userId)
    const prices = await listSizePrices()

    return NextResponse.json({
      prices: prices.map((row) => ({
        id: row.id,
        size: row.size,
        price: Number(row.price),
        enabled: row.enabled,
        updatedBy: row.updatedBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
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
    if ('error' in result) {
      return result.error
    }

    const body = await request.json()
    const rows = Array.isArray(body?.prices) ? body.prices : []
    if (rows.length === 0) {
      return NextResponse.json({ error: 'prices is required' }, { status: 400 })
    }

    for (const row of rows) {
      if (!row || typeof row.size !== 'string' || typeof row.price !== 'number') {
        return NextResponse.json(
          { error: 'each price row must contain size and price' },
          { status: 400 },
        )
      }
      if (row.price < 0) {
        return NextResponse.json({ error: 'price must be >= 0' }, { status: 400 })
      }
    }

    const updated = await batchSetSizePrices(rows, result.auth.userId)

    return NextResponse.json({
      prices: updated.map((row) => ({
        id: row.id,
        size: row.size,
        price: Number(row.price),
        enabled: row.enabled,
        updatedBy: row.updatedBy,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
