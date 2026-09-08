import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { fenToYuan } from '@/lib/money'

export async function GET(request: NextRequest) {
  try {
    const result = await requireRequestAuth(request)
    if ('error' in result) {
      return result.error
    }
    const { auth } = result

    const { searchParams } = request.nextUrl
    const requestedStatus = searchParams.get('status') || undefined
    const validStatuses = ['STARTED', 'QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED'] as const
    if (requestedStatus && !validStatuses.includes(requestedStatus as typeof validStatuses[number])) {
      return NextResponse.json({ error: 'Invalid task status' }, { status: 400 })
    }
    const status = requestedStatus as typeof validStatuses[number] | undefined
    const page = Math.max(1, Number(searchParams.get('page')) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 20))
    const skip = (page - 1) * limit

    let where: Record<string, unknown> = {}

    if (auth.role === 'ADMIN') {
      where = {}
    } else if (auth.authType === 'api-key' && auth.apiKeyId) {
      where = { apiKeyId: auth.apiKeyId }
    } else {
      where = {
        apiKey: {
          ownerUserId: auth.userId,
        },
      }
    }

    if (status) {
      where.status = status
    }

    const isAdmin = auth.role === 'ADMIN'
    const [tasks, total] = await Promise.all([
      prisma.imageGenerationRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          ...(isAdmin ? { prompt: true } : {}),
          status: true,
          ...(isAdmin ? { selectedProviderName: true } : {}),
          durationMs: true,
          createdAt: true,
          errorMessage: isAdmin,
          responseSnapshotJson: isAdmin,
          requestSnapshotJson: isAdmin,
          requestPayloadJson: isAdmin,
          costFen: true,
          costStatus: true,
          pricingSku: true,
          unitPriceFen: true,
          currency: true,
          priceVersion: true,
          callbackUrl: isAdmin,
          workerJobId: isAdmin,
          capacityRequeueCount: isAdmin,
          operation: isAdmin
            ? {
                select: {
                  entryPoint: true,
                },
              }
            : false,
          apiKey: {
            select: {
              id: true,
              name: true,
              keyPrefix: true,
            },
          },
          webhookDeliveries: isAdmin
            ? {
                orderBy: { createdAt: 'desc' },
                take: 3,
              }
            : false,
          _count: {
            select: {
              attempts: true,
              assets: true,
              webhookDeliveries: true,
            },
          },
        },
      }),
      prisma.imageGenerationRequest.count({ where }),
    ])

    return NextResponse.json({
      tasks: tasks.map((task) => ({
        ...task,
        cost: task.costFen !== null ? fenToYuan(task.costFen) : null,
        unitPrice: task.unitPriceFen !== null ? fenToYuan(task.unitPriceFen) : null,
      })),
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
