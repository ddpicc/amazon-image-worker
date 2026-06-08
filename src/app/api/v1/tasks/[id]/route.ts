import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const apiKeyId = request.headers.get('x-api-key-id')
    const userId = request.headers.get('x-user-id')
    const userRole = request.headers.get('x-user-role')
    const authType = request.headers.get('x-auth-type')

    if (!userId || !userRole || !authType) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const where = userRole === 'ADMIN'
      ? { id }
      : authType === 'api-key' && apiKeyId
        ? { id, apiKeyId }
        : {
            id,
            apiKey: {
              ownerUserId: userId,
            },
          }

    const task = await prisma.imageGenerationRequest.findFirst({
      where,
      include: {
        apiKey: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
          },
        },
        attempts: {
          orderBy: { attemptIndex: 'asc' },
        },
        assets: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json({ data: task })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
