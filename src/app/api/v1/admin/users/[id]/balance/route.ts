import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdminRequest } from '@/lib/auth/request-auth'
import { adjustBalance, getUserBalance, parseYuanAmountToFen } from '@/lib/billing/billing-service'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }

    const { id } = await params
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        enabled: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const balance = await getUserBalance(id)

    return NextResponse.json({
      user: {
        ...user,
        balance,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }

    const { id } = await params
    const body = await request.json()
    const { amount, reason } = body as { amount?: number; reason?: string }

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) {
      return NextResponse.json(
        { error: 'amount must be a non-zero number' },
        { status: 400 },
      )
    }

    const amountFen = parseYuanAmountToFen(amount)
    if (
      !Number.isSafeInteger(amountFen) ||
      amountFen === 0 ||
      amountFen < -2_147_483_648 ||
      amountFen > 2_147_483_647
    ) {
      return NextResponse.json({ error: '金额必须至少为 0.01 元，且不能超出余额范围' }, { status: 400 })
    }

    const exists = await prisma.user.findUnique({ where: { id }, select: { id: true, balanceFen: true } })
    if (!exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (exists.balanceFen + amountFen < -2_147_483_648 || exists.balanceFen + amountFen > 2_147_483_647) {
      return NextResponse.json({ error: '调整后余额超出系统范围' }, { status: 400 })
    }

    const resultData = await adjustBalance(id, amountFen, result.auth.userId, reason)

    return NextResponse.json({
      success: true,
      newBalance: resultData.newBalance,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
