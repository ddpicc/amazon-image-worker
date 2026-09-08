import { ImageProvider } from '@prisma/client'

export interface ScoringWeights {
  priority: number    // default 0.3
  successRate: number // default 0.4
  latency: number     // default 0.2
  cost: number        // default 0.1
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  priority: 0.3,
  successRate: 0.4,
  latency: 0.2,
  cost: 0.1,
}

const MIN_CONFIDENCE_SAMPLES = 5
const COLD_START_SCORE_FACTOR = 0.9

export interface ScoredProvider {
  provider: ImageProvider
  score: number
  breakdown: {
    priorityScore: number
    successRateScore: number
    latencyScore: number
    costScore: number
  }
}

// Rolling window success rate data from DB
export interface ProviderRollingStats {
  providerId: string
  recentSuccessRate: number  // 0-1
  recentAvgDurationMs: number
  recentAttemptCount: number
}

export function scoreProviders(
  providers: ImageProvider[],
  rollingStats: Map<string, ProviderRollingStats>,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ScoredProvider[] {
  if (providers.length === 0) return []

  // Normalize across all providers
  const priorities = providers.map(p => p.priority)
  const minPriority = Math.min(...priorities)
  const maxPriority = Math.max(...priorities)
  const latencies = providers
    .map(p => rollingStats.get(p.id)?.recentAvgDurationMs || p.avgDurationMs)
    .filter(value => value > 0)
  const maxLatency = Math.max(...latencies, 1)
  const maxCost = Math.max(...providers.map(p => p.estimatedCostPerReq), 0.001)

  const scored = providers.map(provider => {
    const stats = rollingStats.get(provider.id)

    // Bayesian smoothing keeps a new provider near neutral until it has a
    // minimum sample, instead of granting it perfect latency/cost scores.
    const observedAttempts = stats?.recentAttemptCount ?? provider.totalAttempts
    const observedSuccesses = stats
      ? stats.recentSuccessRate * stats.recentAttemptCount
      : provider.successfulAttempts
    const successRate = (observedSuccesses + MIN_CONFIDENCE_SAMPLES * 0.5)
      / (observedAttempts + MIN_CONFIDENCE_SAMPLES)

    const avgLatency = stats?.recentAvgDurationMs ?? provider.avgDurationMs

    const priorityScore = maxPriority > minPriority
      ? 1 - ((provider.priority - minPriority) / (maxPriority - minPriority))
      : 0.5
    const successRateScore = successRate
    const latencyScore = avgLatency > 0 ? 1 - (avgLatency / maxLatency) : 0.5
    const costScore = provider.estimatedCostPerReq > 0
      ? 1 - (provider.estimatedCostPerReq / maxCost)
      : 0.5

    const baseScore =
      weights.priority * priorityScore +
      weights.successRate * successRateScore +
      weights.latency * latencyScore +
      weights.cost * costScore
    const confidenceFactor = observedAttempts < MIN_CONFIDENCE_SAMPLES ? COLD_START_SCORE_FACTOR : 1
    const score = baseScore * confidenceFactor

    return {
      provider,
      score,
      breakdown: { priorityScore, successRateScore, latencyScore, costScore },
    }
  })

  return scored.sort((a, b) => b.score - a.score)
}
