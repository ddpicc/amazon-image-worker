import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdminRequest } from '@/lib/auth/request-auth'

export async function GET(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            apiKeys: true,
            sessions: true,
          },
        },
        apiKeys: {
          select: {
            requests: {
              select: { id: true },
            },
          },
        },
      },
    })

    return NextResponse.json({
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        enabled: user.enabled,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        apiKeyCount: user._count.apiKeys,
        sessionCount: user._count.sessions,
        taskCount: user.apiKeys.reduce((sum, key) => sum + key.requests.length, 0),
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
