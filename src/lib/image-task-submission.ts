import { Prisma } from '@prisma/client'
import {
  getAiOperationExpiryDate,
  completeAiOperation,
} from '@/lib/ai-operations'
import { refundBalance } from '@/lib/billing/billing-service'
import { prisma } from '@/lib/db/prisma'
import { enqueueImageGeneration } from '@/lib/image-generation-worker-queue'
import { buildPersistedImageGenerationPayload } from '@/lib/image-generation-service'
import type { AspectRatio, RenderSize } from '@/lib/image-options'
import type { StoredReferenceImage } from '@/lib/amazon-workflow'
import { dispatchImageTaskCallback } from '@/lib/image-task-callback'
import { logger } from '@/lib/logger'

export class SubmitImageTaskError extends Error {
  status: number
  code: string
  details?: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'SubmitImageTaskError'
    this.status = status
    this.code = code
    this.details = details
  }
}

interface SubmitBillableImageTaskParams {
  userId: string
  apiKeyId: string
  model?: string | null
  prompt: string
  originalPrompt: string
  entryApi: string
  imageType: string | null
  aspectRatio?: AspectRatio | null
  size: RenderSize
  referenceImages: StoredReferenceImage[]
  metadata?: Record<string, unknown>
  callbackUrl?: string | null
  idempotencyKey?: string | null
  pricingSku: string
  unitPrice: number
  priceVersion: number
  totalCost: number
}

interface SubmitBillableImageTaskResult {
  requestId: string
  operationId: string
  pricingSku: string
  unitPrice: number
  priceVersion: number
  totalCost: number
  idempotent: boolean
}

type QuotaRow = {
  id: string
  dailyLimit: number | null
  monthlyLimit: number | null
  dailyUsed: number
  monthlyUsed: number
}

function upstreamApiKindFromReferenceCount(referenceImageCount: number) {
  return referenceImageCount > 0 ? 'IMAGES_EDIT' : 'IMAGES_GENERATE'
}

function toNullableJsonValue(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

async function lockAndIncrementQuota(
  tx: Prisma.TransactionClient,
  apiKeyId: string,
) {
  const rows = await tx.$queryRaw<QuotaRow[]>`
    SELECT id, "dailyLimit", "monthlyLimit", "dailyUsed", "monthlyUsed"
    FROM "Quota"
    WHERE "apiKeyId" = ${apiKeyId}
    FOR UPDATE
  `
  const quota = rows[0]
  if (!quota) return

  if (quota.dailyLimit !== null && quota.dailyUsed >= quota.dailyLimit) {
    throw new SubmitImageTaskError(
      429,
      'daily_limit_exceeded',
      'daily_limit_exceeded',
    )
  }
  if (quota.monthlyLimit !== null && quota.monthlyUsed >= quota.monthlyLimit) {
    throw new SubmitImageTaskError(
      429,
      'monthly_limit_exceeded',
      'monthly_limit_exceeded',
    )
  }

  await tx.quota.update({
    where: { id: quota.id },
    data: {
      dailyUsed: { increment: 1 },
      monthlyUsed: { increment: 1 },
    },
  })
}

async function decrementQuotaBestEffort(apiKeyId: string) {
  await prisma.$executeRaw`
    UPDATE "Quota"
    SET "dailyUsed" = GREATEST("dailyUsed" - 1, 0),
        "monthlyUsed" = GREATEST("monthlyUsed" - 1, 0),
        "updatedAt" = NOW()
    WHERE "apiKeyId" = ${apiKeyId}
  `.catch(() => undefined)
}

async function compensateFailedEnqueue(params: {
  userId: string
  apiKeyId: string
  requestId: string
  operationId: string
  totalCost: number
  error: unknown
}) {
  const message =
    params.error instanceof Error ? params.error.message : String(params.error)

  logger.error('image.submit.enqueue_failed', {
    requestId: params.requestId,
    operationId: params.operationId,
    apiKeyId: params.apiKeyId,
    userId: params.userId,
    totalCost: params.totalCost,
    error: params.error,
  })

  await decrementQuotaBestEffort(params.apiKeyId)
  await refundBalance(
    params.userId,
    params.totalCost,
    params.requestId,
    'enqueue_failed',
  )
  await prisma.imageGenerationRequest
    .update({
      where: { id: params.requestId },
      data: {
        status: 'FAILED',
        errorMessage: `Failed to enqueue image generation job: ${message}`,
        statusMessage: '任务提交失败，已自动退款',
        completedAt: new Date(),
      },
    })
    .catch(() => undefined)
  await completeAiOperation({
    operationId: params.operationId,
    status: 'FAILED',
    errorMessage: `Failed to enqueue image generation job: ${message}`,
  }).catch(() => undefined)
}

export async function submitBillableImageTask(
  params: SubmitBillableImageTaskParams,
): Promise<SubmitBillableImageTaskResult> {
  const normalizedIdempotencyKey = params.idempotencyKey?.trim() || null

  const requestPayload = await buildPersistedImageGenerationPayload({
    model: params.model ?? null,
    prompt: params.prompt,
    originalPrompt: params.originalPrompt,
    imageType: params.imageType,
    aspectRatio: params.aspectRatio ?? null,
    size: params.size,
    referenceImages: params.referenceImages,
    metadata: params.metadata,
    callbackUrl: params.callbackUrl ?? null,
  })

  let result: SubmitBillableImageTaskResult
  try {
    result = await prisma.$transaction(async (tx) => {
      if (normalizedIdempotencyKey) {
        const existing = await tx.imageGenerationRequest.findFirst({
          where: {
            apiKeyId: params.apiKeyId,
            idempotencyKey: normalizedIdempotencyKey,
          },
          select: {
            id: true,
            operationId: true,
            cost: true,
            pricingSku: true,
            unitPrice: true,
            priceVersion: true,
          },
        })
        if (existing?.operationId) {
          return {
            requestId: existing.id,
            operationId: existing.operationId,
            pricingSku: existing.pricingSku ?? params.pricingSku,
            unitPrice:
              existing.unitPrice !== null ? Number(existing.unitPrice) : params.unitPrice,
            totalCost:
              existing.cost !== null ? Number(existing.cost) : params.totalCost,
            priceVersion: existing.priceVersion ?? params.priceVersion,
            idempotent: true,
          }
        }
      }

      await lockAndIncrementQuota(tx, params.apiKeyId)

      const balanceRows = await tx.$queryRaw<
        Array<{ balance: Prisma.Decimal | string | number | bigint }>
      >`
      SELECT balance FROM "User" WHERE id = ${params.userId} FOR UPDATE
    `
      const currentBalance = Number(balanceRows[0]?.balance ?? 0)
      if (currentBalance < params.totalCost) {
        throw new SubmitImageTaskError(
          402,
          'insufficient_balance',
          'Insufficient balance',
          {
            balance: currentBalance,
            required: params.totalCost,
          },
        )
      }

      const operation = await tx.aiOperation.create({
        data: {
          apiKeyId: params.apiKeyId,
          kind: 'IMAGE_GENERATION',
          entryPoint: params.entryApi,
          status: 'STARTED',
          inputSummaryJson: toNullableJsonValue({
            promptLength: params.prompt.length,
            imageType: params.imageType,
            aspectRatio: params.aspectRatio ?? null,
            size: params.size,
            referenceImageCount: params.referenceImages.length,
            referenceMediaTypes: params.referenceImages.map(
              (image) => image.mimeType,
            ),
            idempotencyKey: normalizedIdempotencyKey,
          }),
          requestSnapshotJson: toNullableJsonValue({
            prompt: params.prompt,
            originalPrompt: params.originalPrompt,
            imageType: params.imageType,
            aspectRatio: params.aspectRatio ?? null,
            size: params.size,
            referenceImages: params.referenceImages.map((image, index) => ({
              index,
              url: image.url,
              mimeType: image.mimeType,
              sizeBytes: image.bytes,
            })),
            idempotencyKey: normalizedIdempotencyKey,
          }),
          expiresAt: getAiOperationExpiryDate(),
        },
      })

      const request = await tx.imageGenerationRequest.create({
        data: {
          apiKeyId: params.apiKeyId,
          operationId: operation.id,
          prompt: params.originalPrompt,
          finalPrompt: params.prompt,
          imageType: params.imageType,
          aspectRatio: params.aspectRatio ?? null,
          size: params.size,
          callbackUrl: params.callbackUrl ?? null,
          idempotencyKey: normalizedIdempotencyKey,
          metadata: params.metadata
            ? (params.metadata as Prisma.InputJsonValue)
            : undefined,
          referenceImageCount: params.referenceImages.length,
          referenceImagesJson:
            params.referenceImages as unknown as Prisma.InputJsonValue,
          requestPayloadJson:
            requestPayload as unknown as Prisma.InputJsonValue,
          requestSnapshotJson:
            requestPayload as unknown as Prisma.InputJsonValue,
          finalUpstreamApiKind: upstreamApiKindFromReferenceCount(
            params.referenceImages.length,
          ),
          status: 'QUEUED',
          statusMessage: '任务已提交，等待 worker 处理',
          cost: new Prisma.Decimal(params.totalCost),
          costStatus: 'CHARGED',
          pricingSku: params.pricingSku,
          unitPrice: new Prisma.Decimal(params.unitPrice),
          priceVersion: params.priceVersion,
          queuedAt: new Date(),
        },
      })

      await tx.user.update({
        where: { id: params.userId },
        data: { balance: { decrement: new Prisma.Decimal(params.totalCost) } },
      })

      await tx.balanceLog.create({
        data: {
          userId: params.userId,
          amount: new Prisma.Decimal(-params.totalCost),
          status: 'CHARGED',
          reason: `request_charged:${request.id}`,
        },
      })

      return {
        requestId: request.id,
        operationId: operation.id,
        pricingSku: params.pricingSku,
        unitPrice: params.unitPrice,
        priceVersion: params.priceVersion,
        totalCost: params.totalCost,
        idempotent: false,
      }
    })
  } catch (error) {
    if (
      normalizedIdempotencyKey &&
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      const existing = await prisma.imageGenerationRequest.findFirst({
        where: {
          apiKeyId: params.apiKeyId,
          idempotencyKey: normalizedIdempotencyKey,
        },
        select: {
          id: true,
          operationId: true,
          cost: true,
          pricingSku: true,
          unitPrice: true,
          priceVersion: true,
        },
      })
      if (existing?.operationId) {
        return {
          requestId: existing.id,
          operationId: existing.operationId,
          pricingSku: existing.pricingSku ?? params.pricingSku,
          unitPrice:
            existing.unitPrice !== null ? Number(existing.unitPrice) : params.unitPrice,
          totalCost:
            existing.cost !== null ? Number(existing.cost) : params.totalCost,
          priceVersion: existing.priceVersion ?? params.priceVersion,
          idempotent: true,
        }
      }
    }
    throw error
  }

  if (result.idempotent) {
    logger.info('image.submit.idempotent_replay', {
      requestId: result.requestId,
      operationId: result.operationId,
      apiKeyId: params.apiKeyId,
      userId: params.userId,
      idempotencyKey: normalizedIdempotencyKey,
    })
    return result
  }

  try {
    const job = await enqueueImageGeneration({ requestId: result.requestId })
    await prisma.imageGenerationRequest
      .update({
        where: { id: result.requestId },
        data: {
          workerJobId: job.id?.toString() ?? null,
        },
      })
      .catch(() => undefined)
    logger.info('image.submit.enqueued', {
      requestId: result.requestId,
      operationId: result.operationId,
      apiKeyId: params.apiKeyId,
      userId: params.userId,
      jobId: job.id?.toString() ?? null,
      totalCost: result.totalCost,
      pricingSku: result.pricingSku,
      priceVersion: result.priceVersion,
      size: params.size,
      imageType: params.imageType,
      idempotencyKey: normalizedIdempotencyKey,
    })
  } catch (error) {
    await compensateFailedEnqueue({
      userId: params.userId,
      apiKeyId: params.apiKeyId,
      requestId: result.requestId,
      operationId: result.operationId,
      totalCost: result.totalCost,
      error,
    })
    throw new SubmitImageTaskError(
      503,
      'enqueue_failed',
      'Failed to enqueue image generation job',
    )
  }

  return result
}

export async function reconcileTimedOutBillableImageTasks(params?: {
  queuedTimeoutMs?: number
  processingTimeoutMs?: number
  limit?: number
}) {
  const queuedTimeoutMs = params?.queuedTimeoutMs ?? 15 * 60 * 1000
  const processingTimeoutMs = params?.processingTimeoutMs ?? 30 * 60 * 1000
  const limit = params?.limit ?? 50
  const now = new Date()
  const queuedCutoff = new Date(now.getTime() - queuedTimeoutMs)
  const processingCutoff = new Date(now.getTime() - processingTimeoutMs)

  const timedOut = await prisma.imageGenerationRequest.findMany({
    where: {
      OR: [
        {
          status: 'QUEUED',
          queuedAt: { lt: queuedCutoff },
        },
        {
          status: 'PROCESSING',
          startedAt: { lt: processingCutoff },
        },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
    include: {
      apiKey: {
        select: {
          ownerUserId: true,
        },
      },
      assets: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  let reconciled = 0
  for (const request of timedOut) {
    const timeoutReason =
      request.status === 'QUEUED'
        ? 'Queued image generation task timed out before worker processing'
        : 'Processing image generation task timed out'

    const updated = await prisma.imageGenerationRequest.updateMany({
      where: {
        id: request.id,
        status: request.status,
      },
      data: {
        status: 'FAILED',
        errorMessage: timeoutReason,
        statusMessage: '任务处理超时，已自动退款',
        completedAt: new Date(),
      },
    })
    if (updated.count === 0) {
      continue
    }

    logger.warn('image.task.reconciled_timeout', {
      requestId: request.id,
      apiKeyId: request.apiKeyId,
      status: request.status,
      timeoutReason,
      cost: request.cost !== null ? Number(request.cost) : null,
      costStatus: request.costStatus,
    })

    if (
      request.apiKey.ownerUserId &&
      request.cost !== null &&
      request.costStatus === 'CHARGED'
    ) {
      await refundBalance(
        request.apiKey.ownerUserId,
        Number(request.cost),
        request.id,
        'task_timeout',
      )
      await decrementQuotaBestEffort(request.apiKeyId)
    }

    if (request.operationId) {
      await completeAiOperation({
        operationId: request.operationId,
        status: 'FAILED',
        errorMessage: timeoutReason,
      }).catch(() => undefined)
    }

    if (request.callbackUrl) {
      const latestTask = await prisma.imageGenerationRequest.findUnique({
        where: { id: request.id },
        include: {
          assets: {
            orderBy: { createdAt: 'asc' },
          },
        },
      })
      if (latestTask) {
        await dispatchImageTaskCallback({
          callbackUrl: request.callbackUrl,
          task: latestTask,
        }).catch(() => undefined)
      }
    }

    reconciled += 1
  }

  return { scanned: timedOut.length, reconciled }
}
