import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

function toNullableJsonValue(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

export async function createAuditLog(params: {
  actorUserId?: string | null
  targetUserId?: string | null
  action: string
  resourceType: string
  resourceId?: string | null
  requestId?: string | null
  ip?: string | null
  metadata?: unknown
}) {
  return prisma.auditLog.create({
    data: {
      actorUserId: params.actorUserId ?? null,
      targetUserId: params.targetUserId ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      requestId: params.requestId ?? null,
      ip: params.ip ?? null,
      metadata: toNullableJsonValue(params.metadata),
    },
  })
}

export async function listAuditLogs(params: {
  q?: string
  limit: number
}) {
  const { q, limit } = params

  if (q?.trim()) {
    const query = q.trim()
    return prisma.auditLog.findMany({
      where: {
        OR: [
          { action: { contains: query, mode: 'insensitive' } },
          { resourceType: { contains: query, mode: 'insensitive' } },
          { resourceId: { contains: query, mode: 'insensitive' } },
          { requestId: { contains: query, mode: 'insensitive' } },
          { actorUser: { is: { email: { contains: query, mode: 'insensitive' } } } },
          { targetUser: { is: { email: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      include: {
        actorUser: {
          select: { id: true, email: true, name: true, role: true },
        },
        targetUser: {
          select: { id: true, email: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    })
  }

  return prisma.auditLog.findMany({
    include: {
      actorUser: {
        select: { id: true, email: true, name: true, role: true },
      },
      targetUser: {
        select: { id: true, email: true, name: true, role: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}
