import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { searchParams } = request.nextUrl
    const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit')) || 20))

    const tasks = await prisma.imageGenerationRequest.findMany({
      where: {
        apiKey: {
          ownerUserId: id,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        apiKey: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
          },
        },
      },
    })

    return NextResponse.json({ tasks })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
