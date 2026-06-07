import { prisma } from '@/lib/db/prisma'

export interface QuotaCheckResult {
  allowed: boolean
  reason?: string
}

/**
 * Check whether the given API key is within its quota limits.
 * If allowed, atomically increments dailyUsed and monthlyUsed.
 * If no Quota row exists for this key, the request is allowed by default.
 */
export async function checkAndIncrementQuota(
  apiKeyId: string,
): Promise<QuotaCheckResult> {
  const quota = await prisma.quota.findUnique({
    where: { apiKeyId },
  })

  // No quota row → unlimited by default
  if (!quota) {
    return { allowed: true }
  }

  // Check daily limit
  if (quota.dailyLimit !== null && quota.dailyUsed >= quota.dailyLimit) {
    return { allowed: false, reason: 'daily_limit_exceeded' }
  }

  // Check monthly limit
  if (quota.monthlyLimit !== null && quota.monthlyUsed >= quota.monthlyLimit) {
    return { allowed: false, reason: 'monthly_limit_exceeded' }
  }

  // Atomically increment both counters
  await prisma.quota.update({
    where: { apiKeyId },
    data: {
      dailyUsed: { increment: 1 },
      monthlyUsed: { increment: 1 },
    },
  })

  return { allowed: true }
}

/**
 * Set (or update) quota limits for an API key. Uses upsert so it works
 * whether or not a Quota row already exists.
 * Pass null for either limit to clear it (unlimited).
 */
export async function setQuota(
  apiKeyId: string,
  dailyLimit?: number | null,
  monthlyLimit?: number | null,
) {
  return prisma.quota.upsert({
    where: { apiKeyId },
    update: {
      ...(dailyLimit !== undefined ? { dailyLimit } : {}),
      ...(monthlyLimit !== undefined ? { monthlyLimit } : {}),
    },
    create: {
      apiKeyId,
      dailyLimit: dailyLimit ?? null,
      monthlyLimit: monthlyLimit ?? null,
    },
  })
}

/**
 * Reset all dailyUsed counters to 0 and set dailyResetAt to next midnight.
 */
export async function resetDailyQuotas() {
  const now = new Date()
  const nextMidnight = new Date(now)
  nextMidnight.setDate(nextMidnight.getDate() + 1)
  nextMidnight.setHours(0, 0, 0, 0)

  await prisma.quota.updateMany({
    data: {
      dailyUsed: 0,
      dailyResetAt: nextMidnight,
    },
  })
}

/**
 * Reset all monthlyUsed counters to 0 and set monthlyResetAt to the first
 * day of the next month at midnight.
 */
export async function resetMonthlyQuotas() {
  const now = new Date()
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)

  await prisma.quota.updateMany({
    data: {
      monthlyUsed: 0,
      monthlyResetAt: nextMonth,
    },
  })
}
