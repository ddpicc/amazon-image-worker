import { prisma } from '../db/prisma'

const CIRCUIT_BREAKER_WINDOW = 10 // check last N attempts
const CIRCUIT_BREAKER_THRESHOLD = 0.5 // 50% failure rate trips

export async function checkCircuitBreaker(providerId: string): Promise<boolean> {
  // Get last N attempts for this provider
  const recentAttempts = await prisma.imageGenerationAttempt.findMany({
    where: { providerId },
    orderBy: { startedAt: 'desc' },
    take: CIRCUIT_BREAKER_WINDOW,
    select: { status: true },
  })

  if (recentAttempts.length < 5) return false // not enough data

  const failureCount = recentAttempts.filter(a => a.status === 'FAILED').length
  const failureRate = failureCount / recentAttempts.length

  if (failureRate >= CIRCUIT_BREAKER_THRESHOLD) {
    await prisma.imageProvider.update({
      where: { id: providerId },
      data: {
        enabled: false,
        circuitBreakerTrippedAt: new Date(),
        circuitBreakerTripReason: `Circuit breaker tripped: ${(failureRate * 100).toFixed(0)}% failure rate in last ${recentAttempts.length} attempts`,
      },
    })
    return true // tripped
  }

  return false
}

export async function resetCircuitBreaker(providerId: string): Promise<void> {
  await prisma.imageProvider.update({
    where: { id: providerId },
    data: {
      enabled: true,
      circuitBreakerTrippedAt: null,
      circuitBreakerTripReason: null,
      consecutiveFailures: 0,
      cooldownUntil: null,
    },
  })
}
