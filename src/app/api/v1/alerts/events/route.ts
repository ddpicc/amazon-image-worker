import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdminRequest } from '@/lib/auth/request-auth'

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }

    const { searchParams } = request.nextUrl
    const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50))
    const acknowledgedParam = searchParams.get('acknowledged')
    const acknowledged = acknowledgedParam !== null ? acknowledgedParam === 'true' : undefined

    const where: Record<string, unknown> = {}
    if (acknowledged !== undefined) {
      where.acknowledged = acknowledged
    }

    const events = await prisma.alertEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        rule: {
          select: { id: true, name: true, conditionType: true },
        },
        provider: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json({ data: events })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
