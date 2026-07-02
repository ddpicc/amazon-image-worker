import { GenerationStatus, Prisma } from '@prisma/client'

type ImageTaskWithAssets = Prisma.ImageGenerationRequestGetPayload<{
  include: {
    assets: {
      orderBy: { createdAt: 'asc' }
    }
  }
}>

function toSyncStatus(status: GenerationStatus) {
  switch (status) {
    case 'SUCCEEDED':
      return 'completed'
    case 'FAILED':
      return 'failed'
    case 'PROCESSING':
      return 'processing'
    default:
      return 'pending'
  }
}

export function buildSyncImageResponse(task: ImageTaskWithAssets, idempotent: boolean) {
  return {
    created: Math.floor(task.createdAt.getTime() / 1000),
    id: task.id,
    object: task.imageType === 'edit' ? 'image.edit' : 'image.generation',
    model: task.selectedProviderModel || 'gpt-image-2',
    data: task.assets.map((asset) => ({
      url: asset.cosUrl,
      revised_prompt: task.revisedPrompt || undefined,
    })),
    size: task.size ?? undefined,
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
    task: {
      id: task.id,
      status: toSyncStatus(task.status),
    },
    idempotent,
  }
}
