import { prisma } from '../db/prisma'

const CIRCUIT_BREAKER_WINDOW = 10 // check last N attempts
const CIRCUIT_BREAKER_THRESHOLD = 0.5 // 50% failure rate trips

export async function tripCircuitBreaker(params: {
  providerId: string
  reason: string
  attemptId?: string
}): Promise<void> {
  const attempt = params.attemptId
    ? await prisma.imageGenerationAttempt.findUnique({
        where: { id: params.attemptId },
        include: { request: { select: { prompt: true } } },
      })
    : await prisma.imageGenerationAttempt.findFirst({
        where: { providerId: params.providerId, status: 'FAILED' },
        orderBy: { startedAt: 'desc' },
        include: { request: { select: { prompt: true } } },
      })

  const trippedAt = new Date()
  await prisma.$transaction([
    prisma.imageProvider.update({
      where: { id: params.providerId },
      data: {
        enabled: false,
        circuitBreakerTrippedAt: trippedAt,
        circuitBreakerTripReason: params.reason,
      },
    }),
    prisma.providerCircuitBreakerEvent.create({
      data: {
        providerId: params.providerId,
        trippedAt,
        tripReason: params.reason,
        attemptId: attempt?.id,
        requestId: attempt?.requestId,
        attemptIndex: attempt?.attemptIndex,
        baseUrl: attempt?.baseUrl,
        model: attempt?.model,
        errorType: attempt?.errorType,
        errorMessage: attempt?.errorMessage,
        durationMs: attempt?.durationMs,
        prompt: attempt?.request.prompt,
      },
    }),
  ])
}

export async function checkCircuitBreaker(providerId: string, attemptId?: string): Promise<boolean> {
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
    await tripCircuitBreaker({
      providerId,
      attemptId,
      reason: `Circuit breaker tripped: ${(failureRate * 100).toFixed(0)}% failure rate in last ${recentAttempts.length} attempts`,
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
