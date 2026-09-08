import { Prisma } from '@prisma/client'
import {
  getAiOperationExpiryDate,
  completeAiOperation,
} from '@/lib/ai-operations'
import { refundBalance } from '@/lib/billing/billing-service'
import { prisma } from '@/lib/db/prisma'
import {
  executeSyncImageGeneration,
  ProviderCapacityRequeueError,
  ProviderExecutionFailedError,
  ROUTE_TOTAL_TIMEOUT_MS,
} from '@/lib/image-generation-service'
import { enqueueImageGeneration } from '@/lib/image-generation-worker-queue'
import { buildPersistedImageGenerationPayload } from '@/lib/image-generation-service'
import { is2KRenderSize, type AspectRatio, type RenderSize } from '@/lib/image-options'
import { normalizePublicImageModel } from '@/lib/image-models'
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
  unitPriceFen: number
  priceVersion: number
  totalCostFen: number
}

interface SubmitBillableImageTaskResult {
  requestId: string
  operationId: string
  pricingSku: string
  unitPriceFen: number
  priceVersion: number
  totalCostFen: number
  idempotent: boolean
}

type PersistedTaskWithAssets = Prisma.ImageGenerationRequestGetPayload<{
  include: {
    assets: {
      orderBy: { createdAt: 'asc' }
    }
  }
}>

interface ExecuteSyncBillableImageTaskResult extends SubmitBillableImageTaskResult {
  task: PersistedTaskWithAssets
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
  totalCostFen: number
  error: unknown
}) {
  const message =
    params.error instanceof Error ? params.error.message : String(params.error)

  logger.error('image.submit.enqueue_failed', {
    requestId: params.requestId,
    operationId: params.operationId,
    apiKeyId: params.apiKeyId,
    userId: params.userId,
    totalCostFen: params.totalCostFen,
    error: params.error,
  })

  await decrementQuotaBestEffort(params.apiKeyId)
  await refundBalance(
    params.userId,
    params.totalCostFen,
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

async function createBillableImageTask(
  params: SubmitBillableImageTaskParams,
): Promise<SubmitBillableImageTaskResult> {
  const normalizedIdempotencyKey = params.idempotencyKey?.trim() || null

  if (params.model && is2KRenderSize(params.size)) {
    const supports2k = await prisma.imageProvider.count({
      where: {
        enabled: true,
        publicModel: normalizePublicImageModel(params.model),
        supports2k: true,
      },
    })
    if (supports2k === 0) {
      throw new SubmitImageTaskError(
        503,
        'no_2k_provider_available',
        'No image provider that supports 2K is currently available. Please retry later.',
      )
    }
  }

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
            costFen: true,
            pricingSku: true,
            unitPriceFen: true,
            priceVersion: true,
          },
        })
        if (existing?.operationId) {
          return {
            requestId: existing.id,
            operationId: existing.operationId,
            pricingSku: existing.pricingSku ?? params.pricingSku,
            unitPriceFen: existing.unitPriceFen ?? params.unitPriceFen,
            totalCostFen: existing.costFen ?? params.totalCostFen,
            priceVersion: existing.priceVersion ?? params.priceVersion,
            idempotent: true,
          }
        }
      }

      await lockAndIncrementQuota(tx, params.apiKeyId)

      const user = await tx.user.findUnique({
        where: { id: params.userId },
        select: { balanceFen: true },
      })
      const currentBalanceFen = user?.balanceFen ?? 0
      if (currentBalanceFen < params.totalCostFen) {
        throw new SubmitImageTaskError(
          402,
          'insufficient_balance',
          'Insufficient balance',
          {
            balance_fen: currentBalanceFen,
            required_fen: params.totalCostFen,
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
          costFen: params.totalCostFen,
          costStatus: 'CHARGED',
          pricingSku: params.pricingSku,
          unitPriceFen: params.unitPriceFen,
          currency: 'CNY',
          priceVersion: params.priceVersion,
          queuedAt: new Date(),
        },
      })

      await tx.user.update({
        where: { id: params.userId },
        data: { balanceFen: { decrement: params.totalCostFen } },
      })

      await tx.balanceLog.create({
        data: {
          userId: params.userId,
          requestId: request.id,
          amountFen: -params.totalCostFen,
          balanceAfterFen: currentBalanceFen - params.totalCostFen,
          status: 'CHARGED',
          reason: `request_charged:${request.id}`,
          idempotencyKey: `request-charge:${request.id}`,
        },
      })

      return {
        requestId: request.id,
        operationId: operation.id,
        pricingSku: params.pricingSku,
        unitPriceFen: params.unitPriceFen,
        priceVersion: params.priceVersion,
        totalCostFen: params.totalCostFen,
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
          costFen: true,
          pricingSku: true,
          unitPriceFen: true,
          priceVersion: true,
        },
      })
      if (existing?.operationId) {
        return {
          requestId: existing.id,
          operationId: existing.operationId,
          pricingSku: existing.pricingSku ?? params.pricingSku,
          unitPriceFen: existing.unitPriceFen ?? params.unitPriceFen,
          totalCostFen: existing.costFen ?? params.totalCostFen,
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

  return result
}

async function refundFailedSynchronousTask(params: {
  userId: string
  apiKeyId: string
  requestId: string
  totalCostFen: number
  reason: string
}) {
  await decrementQuotaBestEffort(params.apiKeyId)
  await refundBalance(
    params.userId,
    params.totalCostFen,
    params.requestId,
    params.reason,
  )
}

async function loadTaskWithAssets(requestId: string) {
  return prisma.imageGenerationRequest.findUnique({
    where: { id: requestId },
    include: {
      assets: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })
}

async function dispatchStoredTaskCallbackBestEffort(requestId: string) {
  const task = await loadTaskWithAssets(requestId)
  if (!task?.callbackUrl) return

  await dispatchImageTaskCallback({
    callbackUrl: task.callbackUrl,
    task,
  }).catch(() => undefined)
}

function throwForExistingSyncFailure(requestId: string, message: string | null | undefined): never {
  if (message?.includes('no_2k_provider_available')) {
    throw new SubmitImageTaskError(503, 'no_2k_provider_available', 'No image provider that supports 2K is currently available. Please retry later.', {
      request_id: requestId,
    })
  }
  if (message?.includes('No enabled image providers')) {
    throw new SubmitImageTaskError(503, 'no_provider_available', 'No image provider is currently available. Please retry later.', {
      request_id: requestId,
    })
  }

  if (message?.includes('capacity') || message?.includes('满载')) {
    throw new SubmitImageTaskError(503, 'capacity_exceeded', 'The image service is currently busy. Please retry later.', {
      request_id: requestId,
    })
  }

  throw new SubmitImageTaskError(
    520,
    'provider_retry_recommended',
    'Selected provider failed. Retry to reselect another provider.',
    { request_id: requestId },
  )
}

export async function submitBillableImageTaskAsync(
  params: SubmitBillableImageTaskParams,
): Promise<SubmitBillableImageTaskResult> {
  const result = await createBillableImageTask(params)

  if (result.idempotent) {
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
      totalCostFen: result.totalCostFen,
      pricingSku: result.pricingSku,
      priceVersion: result.priceVersion,
      size: params.size,
      imageType: params.imageType,
      idempotencyKey: params.idempotencyKey?.trim() || null,
    })
  } catch (error) {
    await compensateFailedEnqueue({
      userId: params.userId,
      apiKeyId: params.apiKeyId,
      requestId: result.requestId,
      operationId: result.operationId,
      totalCostFen: result.totalCostFen,
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

export async function submitBillableImageTaskSync(
  params: SubmitBillableImageTaskParams,
): Promise<ExecuteSyncBillableImageTaskResult> {
  const result = await createBillableImageTask({
    ...params,
    entryApi: params.entryApi,
  })

  const existingTask = await loadTaskWithAssets(result.requestId)
  if (!existingTask) {
    throw new SubmitImageTaskError(500, 'task_not_found', 'Task not found after submission')
  }

  if (existingTask.status === 'FAILED') {
    throwForExistingSyncFailure(result.requestId, existingTask.errorMessage)
  }

  if (existingTask.status === 'SUCCEEDED') {
    return {
      ...result,
      task: existingTask,
    }
  }

  try {
    await executeSyncImageGeneration(result.requestId)
    const task = await loadTaskWithAssets(result.requestId)
    if (!task) {
      throw new SubmitImageTaskError(500, 'task_not_found', 'Task not found after execution')
    }
    return {
      ...result,
      task,
    }
  } catch (error) {
    if (error instanceof ProviderCapacityRequeueError) {
      throw new SubmitImageTaskError(
        503,
        'capacity_exceeded',
        'The image service is currently busy. Please retry later.',
        { request_id: result.requestId },
      )
    }

    if (error instanceof ProviderExecutionFailedError) {
      await refundFailedSynchronousTask({
        userId: params.userId,
        apiKeyId: params.apiKeyId,
        requestId: result.requestId,
        totalCostFen: result.totalCostFen,
        reason: 'sync_provider_failed',
      })
      await dispatchStoredTaskCallbackBestEffort(result.requestId)
      throw new SubmitImageTaskError(
        520,
        'provider_retry_recommended',
        'Selected provider failed. Retry to reselect another provider.',
        { request_id: result.requestId },
      )
    }

    const task = await loadTaskWithAssets(result.requestId)
    if (task?.status !== 'FAILED') {
      await prisma.imageGenerationRequest.update({
        where: { id: result.requestId },
        data: {
          status: 'FAILED',
          errorMessage: error instanceof Error ? error.message : 'Synchronous image generation failed',
          statusMessage: '同步生成失败，已自动退款',
          completedAt: new Date(),
        },
      }).catch(() => undefined)
    }

    await refundFailedSynchronousTask({
      userId: params.userId,
      apiKeyId: params.apiKeyId,
      requestId: result.requestId,
      totalCostFen: result.totalCostFen,
      reason: 'sync_execution_failed',
    })
    await dispatchStoredTaskCallbackBestEffort(result.requestId)

    throw new SubmitImageTaskError(
      500,
      'sync_execution_failed',
      error instanceof Error ? error.message : 'Synchronous image generation failed',
      { request_id: result.requestId },
    )
  }
}

export async function reconcileTimedOutBillableImageTasks(params?: {
  queuedTimeoutMs?: number
  processingTimeoutMs?: number
  limit?: number
}) {
  const queuedTimeoutMs = params?.queuedTimeoutMs ?? ROUTE_TOTAL_TIMEOUT_MS
  const processingTimeoutMs = params?.processingTimeoutMs ?? ROUTE_TOTAL_TIMEOUT_MS
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
      costFen: request.costFen,
      costStatus: request.costStatus,
    })

    if (
      request.apiKey.ownerUserId &&
      request.costFen !== null &&
      request.costStatus === 'CHARGED'
    ) {
      await refundBalance(
        request.apiKey.ownerUserId,
        request.costFen,
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
