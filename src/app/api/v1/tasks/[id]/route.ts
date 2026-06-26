import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRequestAuth } from '@/lib/auth/request-auth'

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
    const isAdmin = auth.role === 'ADMIN'

    const where = isAdmin
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
      select: {
        id: true,
        apiKeyId: true,
        operationId: true,
        selectedProviderId: isAdmin,
        selectedProviderName: true,
        selectedProviderBaseUrl: isAdmin,
        selectedProviderModel: isAdmin,
        attemptCount: true,
        finalUpstreamApiKind: true,
        status: true,
        statusMessage: true,
        durationMs: true,
        prompt: true,
        finalPrompt: isAdmin,
        revisedPrompt: true,
        imageType: true,
        aspectRatio: true,
        size: true,
        referenceImageCount: true,
        referenceImagesJson: isAdmin,
        requestPayloadJson: isAdmin,
        requestSnapshotJson: isAdmin,
        responseSnapshotJson: isAdmin,
        errorMessage: isAdmin,
        callbackUrl: isAdmin,
        metadata: isAdmin,
        cost: true,
        costStatus: true,
        pricingSku: true,
        unitPrice: true,
        priceVersion: true,
        capacityRequeueCount: isAdmin,
        workerJobId: isAdmin,
        queuedAt: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        updatedAt: true,
        apiKey: {
          select: {
            id: true,
            name: true,
            keyPrefix: true,
          },
        },
        attempts: isAdmin
          ? {
              orderBy: { attemptIndex: 'asc' },
            }
          : false,
        assets: {
          orderBy: { createdAt: 'asc' },
        },
        webhookDeliveries: isAdmin
          ? {
              orderBy: [{ attemptIndex: 'asc' }, { createdAt: 'asc' }],
            }
          : false,
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
