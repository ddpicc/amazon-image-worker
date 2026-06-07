import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const existing = await prisma.alertEvent.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Alert event not found' }, { status: 404 })
    }

    const event = await prisma.alertEvent.update({
      where: { id },
      data: { acknowledged: true },
      include: {
        rule: {
          select: { id: true, name: true, conditionType: true },
        },
        provider: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json({ data: event })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
