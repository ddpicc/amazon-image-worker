import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { checkAndIncrementQuota } from '@/lib/auth/quota-service'
import { createQueuedImageGenerationRequest } from '@/lib/image-generation-service'
import { enqueueImageGeneration } from '@/lib/image-generation-worker-queue'
import type { AspectRatio, RenderSize } from '@/lib/image-options'

export async function GET(request: NextRequest) {
  try {
    const apiKeyId = request.headers.get('x-api-key-id')
    const userId = request.headers.get('x-user-id')
    const userRole = request.headers.get('x-user-role')
    const authType = request.headers.get('x-auth-type')

    if (!userId || !userRole || !authType) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = request.nextUrl
    const status = searchParams.get('status') || undefined
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const skip = (page - 1) * limit

    let where: Record<string, unknown> = {}

    if (userRole === 'ADMIN') {
      where = {}
    } else if (authType === 'api-key' && apiKeyId) {
      where = { apiKeyId }
    } else {
      where = {
        apiKey: {
          ownerUserId: userId,
        },
      }
    }

    if (status) {
      where.status = status
    }

    const [tasks, total] = await Promise.all([
      prisma.imageGenerationRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
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
      }),
      prisma.imageGenerationRequest.count({ where }),
    ])

    return NextResponse.json({
      tasks,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKeyId = request.headers.get('x-api-key-id')
    if (!apiKeyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { prompt, referenceImages, size, aspectRatio, imageType, metadata } = body as {
      prompt?: string
      referenceImages?: Array<{ data: string; mediaType: string }>
      size?: string
      aspectRatio?: string
      imageType?: string
      metadata?: Record<string, unknown>
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }

    const quotaResult = await checkAndIncrementQuota(apiKeyId)
    if (!quotaResult.allowed) {
      return NextResponse.json(
        { error: quotaResult.reason || 'Quota exceeded' },
        { status: 429 },
      )
    }

    const refImages = Array.isArray(referenceImages) ? referenceImages : []
    const resolvedSize = size || '1024x1024'

    const result = await createQueuedImageGenerationRequest({
      apiKeyId,
      prompt: prompt.trim(),
      originalPrompt: prompt.trim(),
      entryApi: 'api-tasks',
      imageType: imageType || null,
      aspectRatio: (aspectRatio as AspectRatio) || null,
      size: resolvedSize as RenderSize,
      referenceImages: refImages.map((img, index) => ({
        url: `data:${img.mediaType};base64,${img.data}`,
        key: `inline-ref-${index}`,
        mimeType: img.mediaType || 'image/jpeg',
        bytes: Buffer.from(img.data, 'base64').byteLength,
        name: `reference-${index}`,
      })),
      metadata,
    })

    await enqueueImageGeneration({ requestId: result.requestId })

    return NextResponse.json({
      requestId: result.requestId,
      status: result.status,
      statusMessage: result.statusMessage,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
