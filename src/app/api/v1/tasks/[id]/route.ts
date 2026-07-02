import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { fenToYuan } from '@/lib/money'

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
        selectedProviderName: isAdmin,
        selectedProviderBaseUrl: isAdmin,
        selectedProviderModel: isAdmin,
        attemptCount: true,
        finalUpstreamApiKind: true,
        status: true,
        statusMessage: true,
        durationMs: true,
        prompt: isAdmin,
        finalPrompt: isAdmin,
        revisedPrompt: isAdmin,
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
        costFen: true,
        costStatus: true,
        pricingSku: true,
        unitPriceFen: true,
        currency: true,
        priceVersion: true,
        capacityRequeueCount: isAdmin,
        workerJobId: isAdmin,
        operation: isAdmin
          ? {
              select: {
                entryPoint: true,
              },
            }
          : false,
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
              include: {
                provider: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
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

    return NextResponse.json({
      data: {
        ...task,
        cost: task.costFen !== null ? fenToYuan(task.costFen) : null,
        unitPrice: task.unitPriceFen !== null ? fenToYuan(task.unitPriceFen) : null,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
