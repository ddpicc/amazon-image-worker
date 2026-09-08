import { ImageProvider, Prisma } from '@prisma/client'
import { prisma } from '../db/prisma'
import { encryptSecret } from '../crypto'
import { scoreProviders, ScoredProvider, ProviderRollingStats, DEFAULT_WEIGHTS, ScoringWeights } from './provider-scoring'
import { normalizePublicImageModel } from '../image-models'
import { is2KRenderSize } from '../image-options'
import { CIRCUIT_BREAKER_RECOVERY_MS } from './circuit-breaker'

// --- Per-Provider Concurrency Tracking ---

export const providerInFlight = new Map<string, number>()
const circuitBreakerProbeLocks = new Map<string, ReturnType<typeof setTimeout>>()

function claimCircuitBreakerProbe(providerId: string): boolean {
  if (circuitBreakerProbeLocks.has(providerId)) return false
  const timer = setTimeout(() => circuitBreakerProbeLocks.delete(providerId), CIRCUIT_BREAKER_RECOVERY_MS)
  circuitBreakerProbeLocks.set(providerId, timer)
  return true
}

export function releaseCircuitBreakerProbe(providerId: string): void {
  const timer = circuitBreakerProbeLocks.get(providerId)
  if (timer) clearTimeout(timer)
  circuitBreakerProbeLocks.delete(providerId)
}

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

function normalizeProviderPublicModel(publicModel: string): string {
  const normalized = normalizePublicImageModel(publicModel)
  if (!normalized) throw new Error('publicModel is required')
  return normalized
}

function normalizeProviderUpstreamModel(model: string): string {
  const normalized = model.trim()
  if (!normalized) throw new Error('model is required')
  return normalized
}

// --- Provider Selection (Smart Routing) ---

export interface ProviderSelectionOptions {
  /** Include cooling/half-open providers for a deliberate fallback probe. */
  includeCoolingDown?: boolean
  /** Return only cooling/half-open providers, never normal ready providers. */
  coolingDownOnly?: boolean
}

export async function selectProviders(
  model?: string | null,
  size?: string | null,
  weights?: ScoringWeights,
  options: ProviderSelectionOptions = {},
): Promise<ScoredProvider[]> {
  const now = new Date()

  // Load mapped providers first; normally only enabled providers participate,
  // with an expired circuit breaker admitted for one half-open probe.
  const where: Prisma.ImageProviderWhereInput = {}
  if (model) {
    where.publicModel = normalizePublicImageModel(model)
  }
  if (typeof size === 'string' && is2KRenderSize(size)) {
    where.supports2k = true
  }

  const allProviders = await prisma.imageProvider.findMany({
    where,
    orderBy: { priority: 'asc' },
  })

  if (allProviders.length === 0) return []

  const recoveryCutoff = new Date(now.getTime() - CIRCUIT_BREAKER_RECOVERY_MS)
  let halfOpenClaimed = false
  const halfOpenProviders = allProviders.filter((provider) => {
    if (halfOpenClaimed) return false
    if (provider.enabled || !provider.circuitBreakerTrippedAt) return false
    if (provider.circuitBreakerTrippedAt > recoveryCutoff) return false
    if (provider.cooldownUntil && provider.cooldownUntil > now) return false
    const claimed = claimCircuitBreakerProbe(provider.id)
    if (claimed) halfOpenClaimed = true
    return claimed
  })
  const halfOpenIds = new Set(halfOpenProviders.map(provider => provider.id))
  const coolingDownProviders = allProviders.filter(provider => provider.enabled && provider.cooldownUntil && provider.cooldownUntil > now)
  const readyProviders = allProviders.filter(provider => provider.enabled && (!provider.cooldownUntil || provider.cooldownUntil <= now))
  const providers = options.coolingDownOnly
    ? [...halfOpenProviders, ...coolingDownProviders]
    : options.includeCoolingDown
      ? [...readyProviders, ...halfOpenProviders, ...coolingDownProviders]
      : readyProviders

  if (providers.length === 0) return []

  // Get rolling 24h stats for all providers
  const rollingStats = await getRollingStats(providers.map(p => p.id))

  // Half-open providers are explicitly requested as a fallback probe.
  const ready = providers.filter(p => !halfOpenIds.has(p.id) && (!p.cooldownUntil || p.cooldownUntil <= now))
  const coolingDown = providers.filter(p => p.cooldownUntil && p.cooldownUntil > now)
  const halfOpen = providers.filter(p => halfOpenIds.has(p.id))

  // Score ready providers (these get priority)
  const scoredReady = scoreProviders(ready, rollingStats, weights)

  // Score cooling down providers (lower priority, appended at end)
  const scoredCooling = scoreProviders(coolingDown, rollingStats, weights)
  const scoredHalfOpen = scoreProviders(halfOpen, rollingStats, weights)

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

  return options.coolingDownOnly || options.includeCoolingDown
    ? [...scoredHalfOpen, ...readySplit.notFull, ...readySplit.full, ...coolingSplit.notFull, ...coolingSplit.full]
    : [...readySplit.notFull, ...readySplit.full]
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
      status: { in: ['SUCCEEDED', 'FAILED'] },
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
  publicModel: string
  model: string
  supports2k?: boolean
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
      publicModel: normalizeProviderPublicModel(data.publicModel),
      model: normalizeProviderUpstreamModel(data.model),
      supports2k: data.supports2k ?? false,
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
  publicModel?: string
  model?: string
  supports2k?: boolean
  priority?: number
  enabled?: boolean
  estimatedCostPerReq?: number
  maxConcurrent?: number
}) {
  const updateData = {
    ...data,
    ...(data.baseUrl ? { baseUrl: normalizeProviderBaseUrl(data.baseUrl) } : {}),
    ...(data.publicModel !== undefined ? { publicModel: normalizeProviderPublicModel(data.publicModel) } : {}),
    ...(data.model !== undefined ? { model: normalizeProviderUpstreamModel(data.model) } : {}),
    ...(data.enabled === true ? {
      circuitBreakerTrippedAt: null,
      circuitBreakerTripReason: null,
      consecutiveFailures: 0,
      cooldownUntil: null,
    } : {}),
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
  await prisma.$executeRaw`
    UPDATE "ImageProvider"
    SET "totalAttempts" = "totalAttempts" + 1,
        "successfulAttempts" = "successfulAttempts" + 1,
        "totalDurationMs" = "totalDurationMs" + ${durationMs},
        "avgDurationMs" = ROUND(("totalDurationMs" + ${durationMs})::numeric / ("totalAttempts" + 1))::integer,
        "lastSuccessAt" = NOW(),
        "cooldownUntil" = NULL,
        "consecutiveFailures" = 0,
        "failureCount" = 0,
        "enabled" = CASE WHEN "circuitBreakerTrippedAt" IS NOT NULL THEN TRUE ELSE "enabled" END,
        "circuitBreakerTrippedAt" = NULL,
        "circuitBreakerTripReason" = NULL
    WHERE "id" = ${providerId}
  `
}

export async function markProviderFailure(providerId: string, durationMs: number) {
  await prisma.$executeRaw`
    UPDATE "ImageProvider"
    SET "totalAttempts" = "totalAttempts" + 1,
        "totalDurationMs" = "totalDurationMs" + ${durationMs},
        "avgDurationMs" = ROUND(("totalDurationMs" + ${durationMs})::numeric / ("totalAttempts" + 1))::integer,
        "lastFailureAt" = NOW()
    WHERE "id" = ${providerId}
  `
}
