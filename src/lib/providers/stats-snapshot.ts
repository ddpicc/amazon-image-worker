import { prisma } from '../db/prisma'

/**
 * Snapshot current provider stats for historical trend charts.
 * Called periodically (every 15 minutes) from the worker process.
 */
export async function snapshotProviderStats(): Promise<void> {
  const providers = await prisma.imageProvider.findMany({
    select: { id: true },
  })

  if (providers.length === 0) return

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

  for (const provider of providers) {
    // Get attempts from the last 24h
    const attempts = await prisma.imageGenerationAttempt.findMany({
      where: {
        providerId: provider.id,
        startedAt: { gte: twentyFourHoursAgo },
      },
      select: {
        status: true,
        durationMs: true,
      },
    })

    const total = attempts.length
    const succeeded = attempts.filter(a => a.status === 'SUCCEEDED').length
    const successRate = total > 0 ? succeeded / total : 0
    const durations = attempts.filter(a => a.durationMs != null).map(a => a.durationMs!)
    const avgDurationMs = durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
      : 0

    // Get provider's estimated cost per request
    const providerRecord = await prisma.imageProvider.findUnique({
      where: { id: provider.id },
      select: { estimatedCostPerReq: true },
    })

    const estimatedCost = (providerRecord?.estimatedCostPerReq ?? 0) * total

    await prisma.providerStatsSnapshot.create({
      data: {
        providerId: provider.id,
        successRate,
        avgDurationMs,
        totalAttempts: total,
        successfulAttempts: succeeded,
        estimatedCost,
      },
    })
  }

  // Clean up snapshots older than 90 days
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  await prisma.providerStatsSnapshot.deleteMany({
    where: { snapshotAt: { lt: ninetyDaysAgo } },
  })

  console.info(`[StatsSnapshot] Snapshoted ${providers.length} providers, cleaned up old records`)
}
