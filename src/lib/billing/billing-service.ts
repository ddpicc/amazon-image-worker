import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
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

/**
 * New-user signup bonus, in fen. 0.2 元 = 20 fen by default.
 * Override with SIGNUP_BONUS_FEN; set to 0 to disable.
 */
export const DEFAULT_SIGNUP_BONUS_FEN = 20

export function getSignupBonusFen(): number {
  const raw = process.env.SIGNUP_BONUS_FEN
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_SIGNUP_BONUS_FEN
  }

  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.warn('[billing] SIGNUP_BONUS_FEN 取值无效，回退到默认值', { raw })
    return DEFAULT_SIGNUP_BONUS_FEN
  }

  return parsed
}

/**
 * Grants the signup bonus to a newly registered user exactly once.
 * Idempotent: guarded by a unique balance-log key per user, so retries
 * (e.g. repeated email verification) never double-credit.
 */
export async function grantSignupBonus(
  userId: string,
): Promise<{ granted: boolean; amountFen: number }> {
  const amountFen = getSignupBonusFen()
  if (amountFen <= 0) {
    return { granted: false, amountFen: 0 }
  }

  const idempotencyKey = `signup-bonus:${userId}`

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.balanceLog.findUnique({
        where: { idempotencyKey },
        select: { id: true },
      })
      if (existing) {
        return { granted: false, amountFen }
      }

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
          status: 'SIGNUP_BONUS',
          reason: '新用户注册赠送',
          idempotencyKey,
        },
      })

      return { granted: true, amountFen }
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      // 并发下另一个请求已经发放，视为成功幂等
      return { granted: false, amountFen }
    }
    throw error
  }
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
