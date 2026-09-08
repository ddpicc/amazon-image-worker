import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdminRequest } from '@/lib/auth/request-auth'

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
      select: {
        id: true,
        prompt: true,
        status: true,
        createdAt: true,
        selectedProviderName: true,
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
