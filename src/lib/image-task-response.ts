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
  const status = mapStatus(task.status)
  const progress = status === 'completed'
    ? 100
    : status === 'processing'
      ? 50
      : status === 'failed'
        ? 100
        : 0
  const latestUrl = task.assets[0]?.cosUrl || null

  return {
    created,
    id: task.id,
    model: 'gpt-image-2',
    object: 'image.generation.task',
    progress,
    status,
    task_info: {
      type: 'image',
    },
    usage: {
      cost: task.cost !== null ? Number(task.cost) : null,
      cost_status: task.costStatus ?? null,
      currency: 'USD',
    },
    data: status === 'completed' && latestUrl
      ? [
          {
            url: latestUrl,
            revised_prompt: task.revisedPrompt,
          },
        ]
      : [],
    error: status === 'failed'
      ? {
          message: task.errorMessage || task.statusMessage || 'Generation failed',
        }
      : null,
  }
}
