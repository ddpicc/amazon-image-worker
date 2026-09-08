import { GenerationStatus, Prisma } from '@prisma/client'

type ImageTaskWithAssets = Prisma.ImageGenerationRequestGetPayload<{
  include: {
    assets: {
      orderBy: { createdAt: 'asc' }
    }
  }
}>

function mapStatus(status: GenerationStatus) {
  switch (status) {
    case 'QUEUED':
    case 'STARTED':
      return 'pending'
    case 'PROCESSING':
      return 'processing'
    case 'SUCCEEDED':
      return 'completed'
    case 'FAILED':
      return 'failed'
    default:
      return 'pending'
  }
}

function publicErrorFromMessage(message: string | null | undefined) {
  if (!message) {
    return {
      code: 'task_failed',
      message: 'The image task failed. Please retry or contact support with the task id.',
    }
  }

  if (message.includes('No enabled image providers')) {
    return {
      code: 'no_provider_available',
      message: 'No image provider is currently available. Please retry later.',
    }
  }
  if (message.includes('capacity') || message.includes('满载')) {
    return {
      code: 'capacity_exceeded',
      message: 'The image service is currently busy. Please retry later.',
    }
  }
  if (message.includes('timed out') || message.includes('timeout') || message.includes('超时')) {
    return {
      code: 'task_timeout',
      message: 'The image task timed out. Please retry later.',
    }
  }
  if (message.includes('All image providers failed') || message.includes('调用失败')) {
    return {
      code: 'provider_failed',
      message: 'The image provider failed to complete the request. Please retry later.',
    }
  }

  return {
    code: 'task_failed',
    message: 'The image task failed. Please retry or contact support with the task id.',
  }
}

function getPublicModel(task: ImageTaskWithAssets): string | undefined {
  const payload = task.requestPayloadJson
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined
  const model = (payload as Record<string, unknown>).model
  return typeof model === 'string' ? model : undefined
}

export function buildImageTaskResponse(task: ImageTaskWithAssets) {
  const created = Math.floor(task.createdAt.getTime() / 1000)
  const publicStatus = mapStatus(task.status)
  const progress = publicStatus === 'completed'
    ? 100
    : publicStatus === 'processing'
      ? 50
      : publicStatus === 'failed'
        ? 100
        : 0

  const completed = publicStatus === 'completed'
  const failed = task.status === 'FAILED'

  const publicError = failed ? publicErrorFromMessage(task.errorMessage) : null

  const data = completed
    ? task.assets.map((asset) => ({
        url: asset.cosUrl,
        revised_prompt: task.revisedPrompt || undefined,
      }))
    : undefined

  return {
    created,
    id: task.id,
    model: getPublicModel(task) || task.selectedProviderModel || undefined,
    object: task.imageType === 'edit' ? 'image.edit.task' : 'image.generation.task',
    progress,
    status: publicStatus,
    task_info: { type: 'image' as const },
    ...(data ? { data } : {}),
    ...(failed
      ? {
          error: publicError,
        }
      : { error: null }),
    size: task.size ?? undefined,
    image_type: task.imageType ?? undefined,
    revised_prompt: task.revisedPrompt ?? undefined,
    usage: {
      sku: task.pricingSku ?? undefined,
      unit_price: task.unitPriceFen !== null ? task.unitPriceFen / 100 : undefined,
      unit_price_fen: task.unitPriceFen ?? undefined,
      price_version: task.priceVersion ?? undefined,
      cost: task.costFen !== null ? task.costFen / 100 : undefined,
      cost_fen: task.costFen ?? undefined,
      cost_status: task.costStatus ?? undefined,
      currency: task.currency ?? 'CNY',
    },
  }
}
