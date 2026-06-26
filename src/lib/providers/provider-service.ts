import { ImageProvider, Prisma } from '@prisma/client'
import { prisma } from '../db/prisma'
import { encryptSecret } from '../crypto'
import { scoreProviders, ScoredProvider, ProviderRollingStats, DEFAULT_WEIGHTS, ScoringWeights } from './provider-scoring'
import { getCompatibleImageProviderModels } from '../image-models'

// --- Per-Provider Concurrency Tracking ---

export const providerInFlight = new Map<string, number>()

export function acquireProviderSlot(providerId: string, max: number): boolean {
  if (max <= 0) return true // unlimited
  const current = providerInFlight.get(providerId) ?? 0
  if (current >= max) return false
  providerInFlight.set(providerId, current + 1)
  return true
}

export function releaseProviderSlot(providerId: string): void {
  const current = providerInFlight.get(providerId) ?? 1
  if (current <= 1) {
    providerInFlight.delete(providerId)
  } else {
    providerInFlight.set(providerId, current - 1)
  }
}

function normalizeProviderBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  let url: URL

  try {
    url = new URL(normalized)
  } catch {
    throw new Error('Invalid provider baseUrl')
  }

  const pathname = url.pathname.replace(/\/+$/, '')
  if (!pathname || pathname === '/') {
    url.pathname = '/v1'
  }

  return url.toString().replace(/\/+$/, '')
}

// --- Provider Selection (Smart Routing) ---

export async function selectProviders(model?: string | null, weights?: ScoringWeights): Promise<ScoredProvider[]> {
  const now = new Date()

  // Fetch all enabled providers, optionally filtered by compatible models
  const where: Prisma.ImageProviderWhereInput = { enabled: true }
  const compatibleModels = getCompatibleImageProviderModels(model)
  if (compatibleModels && compatibleModels.length > 0) {
    where.model = { in: compatibleModels }
  }

  const providers = await prisma.imageProvider.findMany({
    where,
    orderBy: { priority: 'asc' },
  })

  if (providers.length === 0) return []

  // Get rolling 24h stats for all providers
  const rollingStats = await getRollingStats(providers.map(p => p.id))

  // Split into ready and cooling down
  const ready = providers.filter(p => !p.cooldownUntil || p.cooldownUntil <= now)
  const coolingDown = providers.filter(p => p.cooldownUntil && p.cooldownUntil > now)

  // Score ready providers (these get priority)
  const scoredReady = scoreProviders(ready, rollingStats, weights)

  // Score cooling down providers (lower priority, appended at end)
  const scoredCooling = scoreProviders(coolingDown, rollingStats, weights)

  // Split by concurrency capacity: not-full first, full last
  function splitByCapacity(scored: ScoredProvider[]): { notFull: ScoredProvider[]; full: ScoredProvider[] } {
    const notFull: ScoredProvider[] = []
    const full: ScoredProvider[] = []
    for (const sp of scored) {
      const max = sp.provider.maxConcurrent
      const inflight = providerInFlight.get(sp.provider.id) ?? 0
      if (max <= 0 || inflight < max) {
        notFull.push(sp)
      } else {
        full.push(sp)
      }
    }
    return { notFull, full }
  }

  const readySplit = splitByCapacity(scoredReady)
  const coolingSplit = splitByCapacity(scoredCooling)

  return [...readySplit.notFull, ...readySplit.full, ...coolingSplit.notFull, ...coolingSplit.full]
}

async function getRollingStats(providerIds: string[]): Promise<Map<string, ProviderRollingStats>> {
  const statsMap = new Map<string, ProviderRollingStats>()

  if (providerIds.length === 0) return statsMap

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  // Query attempts from the last 24h grouped by provider
  const attempts = await prisma.imageGenerationAttempt.findMany({
    where: {
      providerId: { in: providerIds },
      startedAt: { gte: twentyFourHoursAgo },
    },
    select: {
      providerId: true,
      status: true,
      durationMs: true,
    },
  })

  for (const pid of providerIds) {
    const providerAttempts = attempts.filter(a => a.providerId === pid)
    const total = providerAttempts.length
    const succeeded = providerAttempts.filter(a => a.status === 'SUCCEEDED').length
    const durations = providerAttempts.filter(a => a.durationMs != null).map(a => a.durationMs!)
    const avgDuration = durations.length > 0 ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : 0

    statsMap.set(pid, {
      providerId: pid,
      recentSuccessRate: total > 0 ? succeeded / total : 0.5,
      recentAvgDurationMs: avgDuration,
      recentAttemptCount: total,
    })
  }

  return statsMap
}

// --- Provider CRUD ---

export async function listProviders(includeStats = false) {
  const providers = await prisma.imageProvider.findMany({
    orderBy: { priority: 'asc' },
  })

  if (!includeStats) return providers

  // Attach rolling stats
  const rollingStats = await getRollingStats(providers.map(p => p.id))
  return providers.map(p => ({
    ...p,
    rollingStats: rollingStats.get(p.id) ?? null,
  }))
}

export async function getProvider(id: string) {
  return prisma.imageProvider.findUnique({ where: { id } })
}

export async function createProvider(data: {
  name: string
  vendor: string
  baseUrl: string
  model: string
  priority?: number
  apiKeyPlaintext: string
  estimatedCostPerReq?: number
  maxConcurrent?: number
}) {
  const apiKeyCiphertext = await encryptSecret(data.apiKeyPlaintext)
  return prisma.imageProvider.create({
    data: {
      name: data.name,
      vendor: data.vendor,
      baseUrl: normalizeProviderBaseUrl(data.baseUrl),
      model: data.model,
      priority: data.priority ?? 100,
      apiKeyCiphertext,
      estimatedCostPerReq: data.estimatedCostPerReq ?? 0,
      maxConcurrent: data.maxConcurrent ?? 3,
    },
  })
}

export async function updateProvider(id: string, data: {
  name?: string
  vendor?: string
  baseUrl?: string
  model?: string
  priority?: number
  enabled?: boolean
  estimatedCostPerReq?: number
  maxConcurrent?: number
}) {
  const updateData = {
    ...data,
    ...(data.baseUrl ? { baseUrl: normalizeProviderBaseUrl(data.baseUrl) } : {}),
  }

  return prisma.imageProvider.update({
    where: { id },
    data: updateData,
  })
}

export async function deleteProvider(id: string) {
  // Must be disabled first
  const provider = await prisma.imageProvider.findUnique({ where: { id } })
  if (provider?.enabled) {
    throw new Error('Provider must be disabled before deletion')
  }
  return prisma.imageProvider.delete({ where: { id } })
}

export async function moveProviderPriority(id: string, direction: 'up' | 'down') {
  const provider = await prisma.imageProvider.findUnique({ where: { id } })
  if (!provider) throw new Error('Provider not found')

  // Find adjacent provider by priority
  const adjacent = direction === 'up'
    ? await prisma.imageProvider.findFirst({
        where: { priority: { lt: provider.priority } },
        orderBy: { priority: 'desc' },
      })
    : await prisma.imageProvider.findFirst({
        where: { priority: { gt: provider.priority } },
        orderBy: { priority: 'asc' },
      })

  if (!adjacent) return provider // already at edge

  // Swap priorities
  await prisma.$transaction([
    prisma.imageProvider.update({ where: { id: provider.id }, data: { priority: adjacent.priority } }),
    prisma.imageProvider.update({ where: { id: adjacent.id }, data: { priority: provider.priority } }),
  ])

  return prisma.imageProvider.findUnique({ where: { id } })
}

export async function rotateProviderApiKey(id: string, newApiKeyPlaintext: string) {
  const apiKeyCiphertext = await encryptSecret(newApiKeyPlaintext)
  return prisma.imageProvider.update({
    where: { id },
    data: { apiKeyCiphertext },
  })
}

// --- Provider health tracking ---

export async function markProviderSuccess(providerId: string, durationMs: number) {
  const provider = await prisma.imageProvider.findUnique({ where: { id: providerId } })
  if (!provider) return

  // Update running averages
  const newTotalAttempts = provider.totalAttempts + 1
  const newSuccessfulAttempts = provider.successfulAttempts + 1
  const newTotalDuration = provider.totalDurationMs + durationMs
  const newAvgDuration = Math.round(newTotalDuration / newTotalAttempts)

  await prisma.imageProvider.update({
    where: { id: providerId },
    data: {
      totalAttempts: newTotalAttempts,
      successfulAttempts: newSuccessfulAttempts,
      totalDurationMs: newTotalDuration,
      avgDurationMs: newAvgDuration,
      lastSuccessAt: new Date(),
      cooldownUntil: null,
      consecutiveFailures: 0,
      failureCount: 0,
    },
  })
}

export async function markProviderFailure(providerId: string, durationMs: number) {
  const provider = await prisma.imageProvider.findUnique({ where: { id: providerId } })
  if (!provider) return

  const newTotalAttempts = provider.totalAttempts + 1
  const newTotalDuration = provider.totalDurationMs + durationMs
  const newAvgDuration = Math.round(newTotalDuration / newTotalAttempts)

  await prisma.imageProvider.update({
    where: { id: providerId },
    data: {
      totalAttempts: newTotalAttempts,
      totalDurationMs: newTotalDuration,
      avgDurationMs: newAvgDuration,
      lastFailureAt: new Date(),
      failureCount: { increment: 1 },
    },
  })
}
