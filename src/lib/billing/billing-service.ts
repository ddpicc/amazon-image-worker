import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'

function decimalLikeToNumber(value: Prisma.Decimal | string | number | bigint | null | undefined) {
  if (value === null || value === undefined) return 0
  if (typeof value === 'bigint') return Number(value)
  return Number(value)
}

// ============================================================
// Price Lookup
// ============================================================

/**
 * Look up the price for a given size. Returns the price or null if
 * no enabled SizePrice row exists.
 */
export async function lookupSizePrice(size: string): Promise<number | null> {
  const row = await prisma.sizePrice.findUnique({
    where: { size },
  })
  if (!row || !row.enabled) return null
  return Number(row.price)
}

// ============================================================
// Balance Check
// ============================================================

export interface BalanceCheckResult {
  sufficient: boolean
  currentBalance: number
}

/**
 * Check whether a user has enough balance for the given cost.
 */
export async function checkBalance(
  userId: string,
  costUsd: number,
): Promise<BalanceCheckResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  })
  if (!user) {
    return { sufficient: false, currentBalance: 0 }
  }
  const balance = Number(user.balance)
  return { sufficient: balance >= costUsd, currentBalance: balance }
}

// ============================================================
// Deduct Balance (on task creation)
// ============================================================

/**
 * Atomically deduct balance from a user and mark the request as charged.
 * Uses row-level lock (SELECT FOR UPDATE) to prevent concurrent over-draft.
 */
export async function deductBalance(
  userId: string,
  costUsd: number,
  requestId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ balance: Prisma.Decimal | string | number | bigint }>>`
      SELECT balance FROM "User" WHERE id = ${userId} FOR UPDATE
    `
    const currentBalance = decimalLikeToNumber(rows[0]?.balance)
    if (currentBalance < costUsd) {
      throw new Error(
        `Insufficient balance: ${currentBalance} < ${costUsd}`,
      )
    }

    await tx.user.update({
      where: { id: userId },
      data: { balance: { decrement: new Prisma.Decimal(costUsd) } },
    })

    await tx.imageGenerationRequest.update({
      where: { id: requestId },
      data: {
        cost: new Prisma.Decimal(costUsd),
        costStatus: 'CHARGED',
      },
    })

    await tx.balanceLog.create({
      data: {
        userId,
        amount: new Prisma.Decimal(-costUsd),
        status: 'CHARGED',
        reason: `request_charged:${requestId}`,
      },
    })
  })
}

// ============================================================
// Refund Balance (on task failure)
// ============================================================

/**
 * Refund the charged cost back to the user and mark the request as refunded.
 * Safe to call multiple times — checks costStatus first.
 */
export async function refundBalance(
  userId: string,
  costUsd: number,
  requestId: string,
  reason?: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    // Verify the request is still in CHARGED state (idempotency guard)
    const request = await tx.imageGenerationRequest.findUnique({
      where: { id: requestId },
      select: { costStatus: true },
    })
    if (!request || request.costStatus !== 'CHARGED') {
      return // Already refunded or never charged
    }

    // Refund
    await tx.user.update({
      where: { id: userId },
      data: { balance: { increment: new Prisma.Decimal(costUsd) } },
    })

    // Mark request as refunded
    await tx.imageGenerationRequest.update({
      where: { id: requestId },
      data: {
        costStatus: 'REFUNDED',
        statusMessage: reason || '退款：生成失败',
      },
    })

    // Log the refund in BalanceLog
    await tx.balanceLog.create({
      data: {
        userId,
        amount: new Prisma.Decimal(costUsd),
        status: 'REFUNDED',
        reason: reason || 'generation_failed',
      },
    })
  })
}

// ============================================================
// Admin Balance Adjustment
// ============================================================

/**
 * Admin manually adjusts a user's balance (add or subtract).
 * Positive amount = credit (充值), negative = debit (扣减).
 */
export async function adjustBalance(
  userId: string,
  amount: number,
  adminUserId: string,
  reason?: string,
): Promise<{ newBalance: number }> {
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { balance: { increment: new Prisma.Decimal(amount) } },
      select: { balance: true },
    })

    await tx.balanceLog.create({
      data: {
        userId,
        amount: new Prisma.Decimal(amount),
        status: amount >= 0 ? 'ADMIN_CREDIT' : 'ADMIN_DEBIT',
        reason: reason || (amount >= 0 ? '管理员充值' : '管理员扣减'),
        adminUserId,
      },
    })

    return updated
  })

  return { newBalance: Number(result.balance) }
}

// ============================================================
// Get Balance
// ============================================================

export async function getUserBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { balance: true },
  })
  return Number(user?.balance ?? 0)
}

// ============================================================
// Usage History (queries ImageGenerationRequest)
// ============================================================

export interface UsageRecord {
  id: string
  prompt: string
  size: string | null
  cost: number | null
  costStatus: string | null
  status: string
  createdAt: Date
  completedAt: Date | null
  apiKeyId: string
  apiKeyName: string
  ownerUserId: string
  ownerEmail: string
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
  page: number
  limit: number
}): Promise<UsageHistoryResult> {
  const { userId, apiKeyId, from, to, costOnly = true, page, limit } = params

  const where: Record<string, unknown> = {}

  if (costOnly) {
    where.cost = { not: null }
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
        prompt: true,
        size: true,
        cost: true,
        costStatus: true,
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
      prompt: r.prompt,
      size: r.size,
      cost: r.cost !== null ? Number(r.cost) : null,
      costStatus: r.costStatus,
      status: r.status,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      apiKeyId: r.apiKeyId,
      apiKeyName: r.apiKey.name,
      ownerUserId: r.apiKey.ownerUserId ?? '',
      ownerEmail: r.apiKey.ownerUser?.email ?? '',
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  }
}
