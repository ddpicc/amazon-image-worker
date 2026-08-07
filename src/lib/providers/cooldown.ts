import { ErrorType } from '@prisma/client'
import { prisma } from '../db/prisma'
import { tripCircuitBreaker } from './circuit-breaker'

// Cooldown schedules: [1st failure, 2nd, 3rd+] in minutes
const COOLDOWN_SCHEDULES: Record<ErrorType, number[]> = {
  RATE_LIMIT: [2, 10, 30],
  AUTH_FAILURE: [0, 0, 0], // immediate disable (handled separately)
  TIMEOUT: [1, 5, 15],
  PROVIDER_ERROR: [3, 10, 30],
  NETWORK_ERROR: [2, 5, 15],
  UNKNOWN: [5, 15, 30],
}

export async function applyCooldown(
  providerId: string,
  errorType: ErrorType,
  consecutiveFailures: number,
  attemptId?: string,
): Promise<{ disabled: boolean; cooldownMinutes: number }> {
  const schedule = COOLDOWN_SCHEDULES[errorType]

  // AUTH_FAILURE → immediate disable
  if (errorType === 'AUTH_FAILURE') {
    await prisma.imageProvider.update({
      where: { id: providerId },
      data: { consecutiveFailures: consecutiveFailures + 1, lastFailureAt: new Date() },
    })
    await tripCircuitBreaker({
      providerId,
      attemptId,
      reason: 'Authentication failure — provider disabled automatically',
    })
    return { disabled: true, cooldownMinutes: 0 }
  }

  // Get cooldown duration based on consecutive failures
  const idx = Math.min(consecutiveFailures, schedule.length - 1)
  const cooldownMinutes = schedule[idx]
  const cooldownUntil = new Date(Date.now() + cooldownMinutes * 60 * 1000)

  await prisma.imageProvider.update({
    where: { id: providerId },
    data: {
      cooldownUntil,
      consecutiveFailures: consecutiveFailures + 1,
      lastFailureAt: new Date(),
      failureCount: { increment: 1 },
    },
  })

  return { disabled: false, cooldownMinutes }
}

export async function clearCooldown(providerId: string): Promise<void> {
  await prisma.imageProvider.update({
    where: { id: providerId },
    data: {
      cooldownUntil: null,
      consecutiveFailures: 0,
      lastSuccessAt: new Date(),
      failureCount: 0,
    },
  })
}
