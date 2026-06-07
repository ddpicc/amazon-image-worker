import { encryptSecret } from './crypto'
import { prisma } from './db/prisma'

const PROVIDER_COOLDOWN_MINUTES = 5
const PROVIDER_NAME_MAX_LENGTH = 64
const PROVIDER_VENDOR_MAX_LENGTH = 64
const PROVIDER_MODEL_MAX_LENGTH = 128
const PROVIDER_PRIORITY_MAX = 100000
const PROVIDER_API_KEY_MAX_LENGTH = 4096

function getCooldownUntil() {
  const date = new Date()
  date.setMinutes(date.getMinutes() + PROVIDER_COOLDOWN_MINUTES)
  return date
}

function normalizeText(value: string, field: string, maxLength: number): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`${field} is required`)
  }
  if (normalized.length > maxLength) {
    throw new Error(`${field} is too long`)
  }
  return normalized
}

function normalizePriority(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > PROVIDER_PRIORITY_MAX) {
    throw new Error('priority is invalid')
  }
  return value
}

function normalizeBaseUrl(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('baseUrl is required')
  }

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('baseUrl is invalid')
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('baseUrl must use http or https')
  }

  if (parsed.username || parsed.password) {
    throw new Error('baseUrl must not contain credentials')
  }

  const formatted = parsed.toString().replace(/\/$/, '')
  return formatted
}

function normalizeApiKey(value: string): string {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('apiKey is required')
  }
  if (normalized.length > PROVIDER_API_KEY_MAX_LENGTH) {
    throw new Error('apiKey is too long')
  }
  return normalized
}

async function ensureCanReduceEnabledProviders(providerId?: string) {
  const enabledCount = await prisma.imageProvider.count({
    where: providerId
      ? { enabled: true, NOT: { id: providerId } }
      : { enabled: true },
  })

  if (enabledCount === 0) {
    throw new Error('At least one enabled provider must remain')
  }
}

export async function listCandidateImageProviders() {
  const providers = await prisma.imageProvider.findMany({
    where: { enabled: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })
  type ImageProviderRecord = (typeof providers)[number]

  const now = Date.now()
  const ready = providers.filter((provider: ImageProviderRecord) => !provider.cooldownUntil || provider.cooldownUntil.getTime() <= now)
  const coolingDown = providers.filter((provider: ImageProviderRecord) => provider.cooldownUntil && provider.cooldownUntil.getTime() > now)
  return [...ready, ...coolingDown]
}

export async function createImageProvider(input: {
  name: string
  vendor: string
  baseUrl: string
  model: string
  priority: number
  enabled?: boolean
  apiKey: string
}) {
  const name = normalizeText(input.name, 'name', PROVIDER_NAME_MAX_LENGTH)
  const vendor = normalizeText(input.vendor, 'vendor', PROVIDER_VENDOR_MAX_LENGTH)
  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const model = normalizeText(input.model, 'model', PROVIDER_MODEL_MAX_LENGTH)
  const priority = normalizePriority(input.priority)
  const apiKeyCiphertext = encryptSecret(normalizeApiKey(input.apiKey))
  const enabled = Boolean(input.enabled)

  return prisma.imageProvider.create({
    data: {
      name,
      vendor,
      baseUrl,
      model,
      priority,
      enabled,
      apiKeyCiphertext,
    },
  })
}

export async function updateImageProviderPriority(providerId: string, priorityValue: number) {
  const priority = normalizePriority(priorityValue)
  return prisma.imageProvider.update({
    where: { id: providerId },
    data: { priority },
  })
}

export async function moveImageProvider(providerId: string, direction: 'up' | 'down') {
  const providers = await prisma.imageProvider.findMany({
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, priority: true },
  })

  const currentIndex = providers.findIndex((provider) => provider.id === providerId)
  if (currentIndex === -1) {
    throw new Error('Provider not found')
  }

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1
  if (targetIndex < 0 || targetIndex >= providers.length) {
    return providers[currentIndex]
  }

  const current = providers[currentIndex]
  const target = providers[targetIndex]

  if (!current || !target) {
    throw new Error('Provider move target not found')
  }

  await prisma.$transaction([
    prisma.imageProvider.update({
      where: { id: current.id },
      data: { priority: target.priority },
    }),
    prisma.imageProvider.update({
      where: { id: target.id },
      data: { priority: current.priority },
    }),
  ])

  return prisma.imageProvider.findUnique({
    where: { id: current.id },
    select: { id: true, priority: true },
  })
}

export async function updateImageProviderEnabled(providerId: string, enabled: boolean) {
  const provider = await prisma.imageProvider.findUnique({
    where: { id: providerId },
    select: { id: true, enabled: true },
  })

  if (!provider) {
    throw new Error('Provider not found')
  }

  if (provider.enabled && !enabled) {
    await ensureCanReduceEnabledProviders(providerId)
  }

  return prisma.imageProvider.update({
    where: { id: providerId },
    data: { enabled },
  })
}

export async function rotateImageProviderApiKey(providerId: string, apiKey: string) {
  return prisma.imageProvider.update({
    where: { id: providerId },
    data: {
      apiKeyCiphertext: encryptSecret(normalizeApiKey(apiKey)),
    },
  })
}

export async function deleteImageProvider(providerId: string) {
  const provider = await prisma.imageProvider.findUnique({
    where: { id: providerId },
    select: { id: true, enabled: true },
  })

  if (!provider) {
    throw new Error('Provider not found')
  }

  if (provider.enabled) {
    throw new Error('Disable provider before deleting it')
  }

  return prisma.imageProvider.delete({
    where: { id: providerId },
  })
}

export async function markProviderSuccess(providerId: string) {
  await prisma.imageProvider.update({
    where: { id: providerId },
    data: {
      failureCount: 0,
      cooldownUntil: null,
      lastSuccessAt: new Date(),
    },
  })
}

export async function markProviderFailure(providerId: string) {
  await prisma.imageProvider.update({
    where: { id: providerId },
    data: {
      failureCount: { increment: 1 },
      lastFailureAt: new Date(),
      cooldownUntil: getCooldownUntil(),
    },
  })
}
