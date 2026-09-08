import { prisma } from './db/prisma'
export function normalizePublicImageModel(model: string): string {
  return model.trim().toLowerCase()
}

// Upstream names are not aliased here; this normalization is only for
// model-specific adapter capability checks.
export function normalizeImageModel(model: string): string {
  return model.trim().toLowerCase()
}

export function isAgnesImageModel(model: string): boolean {
  return normalizeImageModel(model).startsWith('agnes-image-')
}

export async function listPublicImageModels(): Promise<string[]> {
  const providers = await prisma.imageProvider.findMany({
    where: { enabled: true },
    orderBy: { priority: 'asc' },
    distinct: ['publicModel'],
    select: { publicModel: true },
  })

  return providers.map((provider) => provider.publicModel)
}

export async function resolvePublicImageModel(model?: string | null): Promise<string | null> {
  const requestedModel = model ? normalizePublicImageModel(model) : null
  const provider = await prisma.imageProvider.findFirst({
    where: {
      enabled: true,
      ...(requestedModel ? { publicModel: requestedModel } : {}),
    },
    orderBy: { priority: 'asc' },
    select: { publicModel: true },
  })

  return provider?.publicModel ?? null
}
