import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const body = await request.json()
    const { name, enabled, conditionType, threshold, webhookUrl } = body as {
      name?: string
      enabled?: boolean
      conditionType?: string
      threshold?: unknown
      webhookUrl?: string
    }

    const existing = await prisma.alertRule.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Alert rule not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (enabled !== undefined) updateData.enabled = enabled
    if (conditionType !== undefined) updateData.conditionType = conditionType
    if (threshold !== undefined) updateData.threshold = threshold
    if (webhookUrl !== undefined) updateData.webhookUrl = webhookUrl

    const rule = await prisma.alertRule.update({
      where: { id },
      data: updateData,
      include: {
        provider: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json({ data: rule })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    await prisma.alertRule.delete({ where: { id } })

    return NextResponse.json({ data: { deleted: true, id } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
