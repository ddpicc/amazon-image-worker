import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdminRequest } from '@/lib/auth/request-auth'

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) return result.error

    const events = await prisma.providerCircuitBreakerEvent.findMany({
      orderBy: { trippedAt: 'desc' },
      take: 50,
      include: {
        provider: {
          select: { id: true, name: true, vendor: true },
        },
      },
    })

    return NextResponse.json({ data: events })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
