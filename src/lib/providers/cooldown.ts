import { ErrorType } from '@prisma/client'
import { prisma } from '../db/prisma'
import { tripCircuitBreaker } from './circuit-breaker'

// Cooldown schedules: [1st failure, 2nd, 3rd+] in minutes
const COOLDOWN_SCHEDULES: Record<ErrorType, number[]> = {
  PARAMETER_ERROR: [],
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
  attemptId?: string,
): Promise<{ disabled: boolean; cooldownMinutes: number }> {
  if (errorType === 'PARAMETER_ERROR') {
    return { disabled: false, cooldownMinutes: 0 }
  }
  const schedule = COOLDOWN_SCHEDULES[errorType]
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ consecutiveFailures: number }>>`
      SELECT "consecutiveFailures"
      FROM "ImageProvider"
      WHERE "id" = ${providerId}
      FOR UPDATE
    `
    if (rows.length === 0) return { disabled: false, cooldownMinutes: 0 }

    const consecutiveFailures = Number(rows[0].consecutiveFailures || 0)
    const nextConsecutiveFailures = consecutiveFailures + 1

    if (errorType === 'AUTH_FAILURE') {
      await tx.imageProvider.update({
        where: { id: providerId },
        data: { consecutiveFailures: nextConsecutiveFailures, lastFailureAt: new Date(), failureCount: { increment: 1 } },
      })
      return { disabled: true, cooldownMinutes: 0 }
    }

    const idx = Math.min(consecutiveFailures, schedule.length - 1)
    const cooldownMinutes = schedule[idx]
    await tx.imageProvider.update({
      where: { id: providerId },
      data: {
        cooldownUntil: new Date(Date.now() + cooldownMinutes * 60 * 1000),
        consecutiveFailures: nextConsecutiveFailures,
        lastFailureAt: new Date(),
        failureCount: { increment: 1 },
      },
    })
    return { disabled: false, cooldownMinutes }
  })

  if (result.disabled) {
    await tripCircuitBreaker({
      providerId,
      attemptId,
      reason: 'Authentication failure — provider disabled automatically',
    })
  }

  return result
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
