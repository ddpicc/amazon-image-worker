import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const apiKeyId = request.headers.get('x-api-key-id')
    const isAdmin = request.headers.get('x-admin-auth') === 'true'
    if (!apiKeyId && !isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const task = await prisma.imageGenerationRequest.findFirst({
      where: apiKeyId ? { id, apiKeyId } : { id },
      include: {
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
