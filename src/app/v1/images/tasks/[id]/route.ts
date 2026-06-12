import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { buildImageTaskResponse } from '@/lib/image-task-response'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireRequestAuth(request)
    if ('error' in result) {
      return result.error
    }
    const { auth } = result

    const { id } = await params

    const where = auth.role === 'ADMIN'
      ? { id }
      : auth.authType === 'api-key' && auth.apiKeyId
        ? { id, apiKeyId: auth.apiKeyId }
        : {
            id,
            apiKey: {
              ownerUserId: auth.userId,
            },
          }

    const task = await prisma.imageGenerationRequest.findFirst({
      where,
      include: {
        assets: {
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    return NextResponse.json(buildImageTaskResponse(task))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
