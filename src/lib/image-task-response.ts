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

  let errorCode: string | undefined
  if (failed && task.errorMessage) {
    const message = task.errorMessage
    if (message.includes('No enabled image providers')) {
      errorCode = 'no_provider_available'
    } else if (message.includes('capacity')) {
      errorCode = 'capacity_exceeded'
    } else if (message.includes('All image providers failed') || message.includes('调用失败')) {
      errorCode = 'provider_failed'
    } else {
      errorCode = 'task_failed'
    }
  }

  const data = completed
    ? task.assets.map((asset) => ({
        url: asset.cosUrl,
        revised_prompt: task.revisedPrompt || undefined,
      }))
    : undefined

  return {
    created,
    id: task.id,
    model: task.selectedProviderModel || 'gpt-image-2',
    object: task.imageType === 'edit' ? 'image.edit.task' : 'image.generation.task',
    progress,
    status: publicStatus,
    task_info: { type: 'image' as const },
    ...(data ? { data } : {}),
    ...(failed
      ? {
          error: {
            code: errorCode || 'task_failed',
            message: task.errorMessage || 'Unknown error',
          },
        }
      : { error: null }),
    size: task.size ?? undefined,
    image_type: task.imageType ?? undefined,
    revised_prompt: task.revisedPrompt ?? undefined,
    usage: {
      cost: task.cost !== null ? Number(task.cost) : undefined,
      cost_status: task.costStatus ?? undefined,
      currency: 'USD',
    },
  }
}
