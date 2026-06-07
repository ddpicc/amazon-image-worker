import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET() {
  try {
    const rules = await prisma.alertRule.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        provider: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json({ data: rules })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, conditionType, providerId, threshold, webhookUrl } = body as {
      name?: string
      conditionType?: string
      providerId?: string
      threshold?: unknown
      webhookUrl?: string
    }

    if (!name || !conditionType || !webhookUrl) {
      return NextResponse.json(
        { error: 'name, conditionType, and webhookUrl are required' },
        { status: 400 },
      )
    }

    const rule = await prisma.alertRule.create({
      data: {
        name,
        conditionType: conditionType as 'CIRCUIT_BREAKER' | 'FAILURE_RATE' | 'LATENCY_THRESHOLD' | 'PROVIDER_DOWN',
        providerId: providerId || null,
        threshold: threshold ?? undefined,
        webhookUrl,
      },
      include: {
        provider: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json({ data: rule }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
