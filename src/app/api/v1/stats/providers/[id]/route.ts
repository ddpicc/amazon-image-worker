import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const provider = await prisma.imageProvider.findUnique({ where: { id } })
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Rolling 24h success rate from attempts
    const [attempts24h, succeeded24h] = await Promise.all([
      prisma.imageGenerationAttempt.count({
        where: {
          providerId: id,
          startedAt: { gte: twentyFourHoursAgo },
        },
      }),
      prisma.imageGenerationAttempt.count({
        where: {
          providerId: id,
          startedAt: { gte: twentyFourHoursAgo },
          status: 'SUCCEEDED',
        },
      }),
    ])
    const successRate = attempts24h > 0 ? succeeded24h / attempts24h : 0

    // Last 30 ProviderStatsSnapshot records
    const snapshots = await prisma.providerStatsSnapshot.findMany({
      where: { providerId: id },
      orderBy: { snapshotAt: 'desc' },
      take: 30,
    })

    // Error type breakdown (last 7 days, group by errorType)
    const errorRows = await prisma.imageGenerationAttempt.groupBy({
      by: ['errorType'],
      where: {
        providerId: id,
        status: 'FAILED',
        startedAt: { gte: sevenDaysAgo },
        errorType: { not: null },
      },
      _count: { errorType: true },
    })

    const errorBreakdown = errorRows.map((row) => ({
      errorType: row.errorType,
      count: row._count.errorType,
    }))

    return NextResponse.json({
      data: {
        provider: {
          id: provider.id,
          name: provider.name,
          vendor: provider.vendor,
          enabled: provider.enabled,
          priority: provider.priority,
        },
        rolling24h: {
          totalAttempts: attempts24h,
          succeeded: succeeded24h,
          successRate,
        },
        snapshots,
        errorBreakdown,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
