import { prisma } from '../db/prisma'

/**
 * Reset daily quota counters for all API keys.
 * Called at midnight (or near it) from the worker process.
 */
export async function resetDailyQuotas(): Promise<void> {
  const result = await prisma.quota.updateMany({
    data: {
      dailyUsed: 0,
      dailyResetAt: new Date(), // now = start of new day
    },
  })
  console.info(`[QuotaReset] Reset daily quotas for ${result.count} keys`)
}

/**
 * Reset monthly quota counters for all API keys.
 * Called at the start of each month from the worker process.
 */
export async function resetMonthlyQuotas(): Promise<void> {
  const result = await prisma.quota.updateMany({
    data: {
      monthlyUsed: 0,
      monthlyResetAt: new Date(), // now = start of new month
    },
  })
  console.info(`[QuotaReset] Reset monthly quotas for ${result.count} keys`)
}

/**
 * Check if daily quotas need resetting (called before incrementing).
 * If the current date is past the dailyResetAt, trigger a reset.
 */
export async function checkAndResetDailyQuotasIfNeeded(): Promise<void> {
  const now = new Date()
  const quotas = await prisma.quota.findMany({
    where: {
      dailyResetAt: { not: null, lt: now },
    },
    select: { id: true },
  })

  if (quotas.length > 0) {
    await resetDailyQuotas()
  }
}
