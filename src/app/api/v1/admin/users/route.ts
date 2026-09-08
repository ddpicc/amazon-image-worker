import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { requireAdminRequest } from '@/lib/auth/request-auth'
import { fenToYuan } from '@/lib/money'

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }

    const searchParams = request.nextUrl.searchParams
    const rawPage = Number(searchParams.get('page') || '1')
    const rawLimit = Number(searchParams.get('limit') || '20')
    const page = Number.isFinite(rawPage) ? Math.max(1, Math.floor(rawPage)) : 1
    const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 20
    const q = searchParams.get('q')?.trim().slice(0, 100) || ''
    const status = searchParams.get('status')
    const role = searchParams.get('role')

    const where: Prisma.UserWhereInput = {
      ...(q
        ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(status === 'enabled' ? { enabled: true } : {}),
      ...(status === 'disabled' ? { enabled: false } : {}),
      ...(role === 'ADMIN' || role === 'USER' ? { role } : {}),
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          enabled: true,
          balanceFen: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.user.count({ where }),
    ])

    const userIds = users.map((user) => user.id)
    const [apiKeyCounts, sessionCounts, taskCounts] = userIds.length
      ? await Promise.all([
          prisma.apiKey.groupBy({
            by: ['ownerUserId'],
            where: { ownerUserId: { in: userIds }, revokedAt: null },
            _count: { _all: true },
          }),
          prisma.session.groupBy({
            by: ['userId'],
            where: { userId: { in: userIds }, expiresAt: { gt: new Date() } },
            _count: { _all: true },
          }),
          prisma.imageGenerationRequest.groupBy({
            by: ['apiKeyId'],
            where: { apiKey: { ownerUserId: { in: userIds } } },
            _count: { _all: true },
          }),
        ])
      : [[], [], []]

    const apiKeyCountByUser = new Map(apiKeyCounts.map((row) => [row.ownerUserId, row._count._all]))
    const sessionCountByUser = new Map(sessionCounts.map((row) => [row.userId, row._count._all]))
    const apiKeyOwnerById = new Map<string, string>()
    if (taskCounts.length > 0) {
      const taskApiKeys = await prisma.apiKey.findMany({
        where: { id: { in: taskCounts.map((row) => row.apiKeyId) } },
        select: { id: true, ownerUserId: true },
      })
      for (const key of taskApiKeys) {
        if (key.ownerUserId) apiKeyOwnerById.set(key.id, key.ownerUserId)
      }
    }
    const taskCountByUser = new Map<string, number>()
    for (const row of taskCounts) {
      const ownerUserId = apiKeyOwnerById.get(row.apiKeyId)
      if (ownerUserId) taskCountByUser.set(ownerUserId, (taskCountByUser.get(ownerUserId) || 0) + row._count._all)
    }

    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        enabled: user.enabled,
        balance: fenToYuan(user.balanceFen),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        apiKeyCount: apiKeyCountByUser.get(user.id) || 0,
        sessionCount: sessionCountByUser.get(user.id) || 0,
        taskCount: taskCountByUser.get(user.id) || 0,
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
