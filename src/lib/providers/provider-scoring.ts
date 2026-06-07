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
  const maxPriority = Math.max(...providers.map(p => p.priority), 1)
  const maxLatency = Math.max(...providers.map(p => rollingStats.get(p.id)?.recentAvgDurationMs ?? p.avgDurationMs), 1)
  const maxCost = Math.max(...providers.map(p => p.estimatedCostPerReq), 0.001)

  const scored = providers.map(provider => {
    const stats = rollingStats.get(provider.id)

    // Use rolling stats if available, fallback to provider's cumulative stats
    const successRate = stats && stats.recentAttemptCount >= 5
      ? stats.recentSuccessRate
      : (provider.totalAttempts > 0 ? provider.successfulAttempts / provider.totalAttempts : 0.5)

    const avgLatency = stats?.recentAvgDurationMs ?? provider.avgDurationMs

    const priorityScore = 1 - (provider.priority / maxPriority)
    const successRateScore = successRate
    const latencyScore = 1 - (avgLatency / maxLatency)
    const costScore = 1 - (provider.estimatedCostPerReq / maxCost)

    const score =
      weights.priority * priorityScore +
      weights.successRate * successRateScore +
      weights.latency * latencyScore +
      weights.cost * costScore

    return {
      provider,
      score,
      breakdown: { priorityScore, successRateScore, latencyScore, costScore },
    }
  })

  return scored.sort((a, b) => b.score - a.score)
}
