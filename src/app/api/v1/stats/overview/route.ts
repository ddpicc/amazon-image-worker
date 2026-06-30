import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { NextRequest } from 'next/server'
import { requireAdminRequest } from '@/lib/auth/request-auth'

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }

    const now = new Date()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Task counts for different time windows
    const [last24h, last7d, last30d] = await Promise.all([
      prisma.imageGenerationRequest.count({
        where: { createdAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.imageGenerationRequest.count({
        where: { createdAt: { gte: sevenDaysAgo } },
      }),
      prisma.imageGenerationRequest.count({
        where: { createdAt: { gte: thirtyDaysAgo } },
      }),
    ])

    // Success rate (last 24h)
    const [succeeded24h, total24h] = await Promise.all([
      prisma.imageGenerationRequest.count({
        where: {
          createdAt: { gte: twentyFourHoursAgo },
          status: 'SUCCEEDED',
        },
      }),
      prisma.imageGenerationRequest.count({
        where: {
          createdAt: { gte: twentyFourHoursAgo },
          status: { in: ['SUCCEEDED', 'FAILED'] },
        },
      }),
    ])
    const successRate = total24h > 0 ? succeeded24h / total24h : 0

    // Average duration (last 24h, only completed tasks with duration)
    const durationResult = await prisma.imageGenerationRequest.aggregate({
      _avg: { durationMs: true },
      where: {
        createdAt: { gte: twentyFourHoursAgo },
        status: 'SUCCEEDED',
        durationMs: { not: null },
      },
    })
    const avgDurationMs = durationResult._avg.durationMs ?? 0

    // Active provider count
    const activeProviderCount = await prisma.imageProvider.count({
      where: { enabled: true },
    })

    // Recent failures (last 10 failed tasks)
    const recentFailures = await prisma.imageGenerationRequest.findMany({
      where: {
        status: 'FAILED',
        createdAt: { gte: twentyFourHoursAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        prompt: true,
        errorMessage: true,
        createdAt: true,
        selectedProviderName: true,
        durationMs: true,
      },
    })

    return NextResponse.json({
      totalTasks24h: last24h,
      totalTasks7d: last7d,
      totalTasks30d: last30d,
      successRate: Number((successRate * 100).toFixed(1)),
      avgDurationMs: Math.round(avgDurationMs),
      activeProviders: activeProviderCount,
      recentFailures: recentFailures.map((failure) => ({
        id: failure.id,
        prompt: failure.prompt,
        providerName: failure.selectedProviderName,
        errorMessage: failure.errorMessage,
        createdAt: failure.createdAt,
        durationMs: failure.durationMs,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
