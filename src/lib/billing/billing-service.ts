import { prisma } from '@/lib/db/prisma'
import { fenToYuan, yuanToFen } from '@/lib/money'

export interface BalanceCheckResult {
  sufficient: boolean
  currentBalanceFen: number
}

export async function checkBalance(
  userId: string,
  costFen: number,
): Promise<BalanceCheckResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balanceFen: true },
  })

  if (!user) {
    return { sufficient: false, currentBalanceFen: 0 }
  }

  return {
    sufficient: user.balanceFen >= costFen,
    currentBalanceFen: user.balanceFen,
  }
}

export async function refundBalance(
  userId: string,
  costFen: number,
  requestId: string,
  reason?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const request = await tx.imageGenerationRequest.findUnique({
      where: { id: requestId },
      select: { costStatus: true },
    })
    if (!request || request.costStatus !== 'CHARGED') {
      return
    }

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { balanceFen: { increment: costFen } },
      select: { balanceFen: true },
    })

    await tx.imageGenerationRequest.update({
      where: { id: requestId },
      data: {
        costStatus: 'REFUNDED',
        statusMessage: reason || '退款：生成失败',
      },
    })

    await tx.balanceLog.create({
      data: {
        userId,
        requestId,
        amountFen: costFen,
        balanceAfterFen: updatedUser.balanceFen,
        status: 'REFUNDED',
        reason: reason || 'generation_failed',
        idempotencyKey: `request-refund:${requestId}`,
      },
    })
  })
}

export async function adjustBalance(
  userId: string,
  amountFen: number,
  adminUserId: string,
  reason?: string,
): Promise<{ newBalance: number }> {
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { balanceFen: { increment: amountFen } },
      select: { balanceFen: true },
    })

    await tx.balanceLog.create({
      data: {
        userId,
        amountFen,
        balanceAfterFen: updated.balanceFen,
        status: amountFen >= 0 ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
        reason: reason || (amountFen >= 0 ? '管理员充值' : '管理员扣减'),
        adminUserId,
      },
    })

    await tx.auditLog.create({
      data: {
        actorUserId: adminUserId,
        targetUserId: userId,
        action: 'user.balance_adjusted',
        resourceType: 'user_balance',
        resourceId: userId,
        metadata: {
          amountFen,
          reason: reason ?? null,
          balanceAfterFen: updated.balanceFen,
        },
      },
    })

    return updated
  })

  return { newBalance: fenToYuan(result.balanceFen) }
}

export async function getUserBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balanceFen: true },
  })
  return fenToYuan(user?.balanceFen ?? 0)
}

export interface UsageRecord {
  id: string
  size: string | null
  pricingSku: string | null
  unitPrice: number | null
  unitPriceFen: number | null
  priceVersion: number | null
  cost: number | null
  costFen: number | null
  costStatus: string | null
  currency: string
  status: string
  createdAt: Date
  completedAt: Date | null
  apiKeyId: string
  apiKeyName: string
  ownerUserId: string
  ownerEmail: string
  prompt?: string
}

export interface UsageHistoryResult {
  records: UsageRecord[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export async function getUsageHistory(params: {
  userId?: string
  apiKeyId?: string
  from?: Date
  to?: Date
  costOnly?: boolean
  includePrompt?: boolean
  page: number
  limit: number
}): Promise<UsageHistoryResult> {
  const { userId, apiKeyId, from, to, costOnly = true, includePrompt = false, page, limit } = params
  const where: Record<string, unknown> = {}

  if (costOnly) {
    where.costFen = { not: null }
  }

  if (userId) {
    where.apiKey = { ownerUserId: userId }
  }

  if (apiKeyId) {
    where.apiKeyId = apiKeyId
  }

  if (from || to) {
    const createdAt: Record<string, Date> = {}
    if (from) createdAt.gte = from
    if (to) createdAt.lte = to
    where.createdAt = createdAt
  }

  const [records, total] = await Promise.all([
    prisma.imageGenerationRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        ...(includePrompt ? { prompt: true } : {}),
        size: true,
        pricingSku: true,
        unitPriceFen: true,
        priceVersion: true,
        costFen: true,
        costStatus: true,
        currency: true,
        status: true,
        createdAt: true,
        completedAt: true,
        apiKeyId: true,
        apiKey: {
          select: {
            name: true,
            ownerUserId: true,
            ownerUser: { select: { email: true } },
          },
        },
      },
    }),
    prisma.imageGenerationRequest.count({ where }),
  ])

  return {
    records: records.map((r) => ({
      id: r.id,
      size: r.size,
      pricingSku: r.pricingSku,
      unitPriceFen: r.unitPriceFen,
      unitPrice: r.unitPriceFen !== null ? fenToYuan(r.unitPriceFen) : null,
      priceVersion: r.priceVersion,
      costFen: r.costFen,
      cost: r.costFen !== null ? fenToYuan(r.costFen) : null,
      costStatus: r.costStatus,
      currency: r.currency,
      status: r.status,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      apiKeyId: r.apiKeyId,
      apiKeyName: r.apiKey.name,
      ownerUserId: r.apiKey.ownerUserId ?? '',
      ownerEmail: r.apiKey.ownerUser?.email ?? '',
      ...(r as { prompt?: string }).prompt !== undefined ? { prompt: (r as { prompt?: string }).prompt } : {},
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}

export async function listBalanceLogs(params: {
  userId?: string
  q?: string
  limit: number
}) {
  const where: Record<string, unknown> = {}

  if (params.userId) {
    where.userId = params.userId
  }

  if (params.q?.trim()) {
    const query = params.q.trim()
    where.OR = [
      { reason: { contains: query, mode: 'insensitive' } },
      { requestId: { contains: query, mode: 'insensitive' } },
      { paymentOrder: { is: { outTradeNo: { contains: query, mode: 'insensitive' } } } },
      { user: { is: { email: { contains: query, mode: 'insensitive' } } } },
    ]
  }

  const logs = await prisma.balanceLog.findMany({
    where,
    include: {
      user: {
        select: { id: true, email: true, name: true, role: true },
      },
      paymentOrder: {
        select: { id: true, outTradeNo: true, providerOrderId: true, status: true },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit,
  })

  return logs.map((log) => ({
    ...log,
    amount: fenToYuan(log.amountFen),
    balanceAfter: log.balanceAfterFen !== null ? fenToYuan(log.balanceAfterFen) : null,
  }))
}

export function parseYuanAmountToFen(value: number) {
  return yuanToFen(value)
}
