import { PaymentOrderStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { createAuditLog } from '@/lib/audit-log'

type PendingPaymentOrder = {
  id: string
  packageId: string | null
  outTradeNo: string
  amountFen: number
  creditFen: number
  currency: string
  payType: string | null
  provider: string | null
  providerOrderId: string | null
  payUrl: string
  payUrl2: string
  qrcodeUrl: string
  qrcodeImg: string
  createdAt: Date
  topupPackage: {
    id: string
    name: string
    priceFen: number
    creditFen: number
    bonusFen: number
  } | null
}

function toNullableJsonValue(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return Prisma.JsonNull
  return value as Prisma.InputJsonValue
}

const DEFAULT_TOPUP_PACKAGES = [
  { name: 'Starter 9.9', priceFen: 990, creditFen: 1200, bonusFen: 0, displayOrder: 10 },
  { name: 'Growth 29.9', priceFen: 2990, creditFen: 3800, bonusFen: 200, displayOrder: 20 },
  { name: 'Pro 59.9', priceFen: 5990, creditFen: 8000, bonusFen: 500, displayOrder: 30 },
]

export async function ensureDefaultTopupPackages() {
  const count = await prisma.topupPackage.count()
  if (count > 0) return

  await prisma.topupPackage.createMany({
    data: DEFAULT_TOPUP_PACKAGES,
  })
}

export async function listEnabledTopupPackages() {
  await ensureDefaultTopupPackages()
  return prisma.topupPackage.findMany({
    where: { enabled: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function listAllTopupPackages() {
  await ensureDefaultTopupPackages()
  return prisma.topupPackage.findMany({
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  })
}

export async function createTopupPackage(params: {
  name: string
  priceFen: number
  creditFen: number
  bonusFen?: number
  displayOrder?: number
}) {
  return prisma.topupPackage.create({
    data: {
      name: params.name,
      priceFen: params.priceFen,
      creditFen: params.creditFen,
      bonusFen: params.bonusFen ?? 0,
      displayOrder: params.displayOrder ?? 100,
    },
  })
}

export async function updateTopupPackage(params: {
  id: string
  name?: string
  priceFen?: number
  creditFen?: number
  bonusFen?: number
  enabled?: boolean
  displayOrder?: number
}) {
  return prisma.topupPackage.update({
    where: { id: params.id },
    data: {
      ...(params.name !== undefined ? { name: params.name } : {}),
      ...(params.priceFen !== undefined ? { priceFen: params.priceFen } : {}),
      ...(params.creditFen !== undefined ? { creditFen: params.creditFen } : {}),
      ...(params.bonusFen !== undefined ? { bonusFen: params.bonusFen } : {}),
      ...(params.enabled !== undefined ? { enabled: params.enabled } : {}),
      ...(params.displayOrder !== undefined ? { displayOrder: params.displayOrder } : {}),
    },
  })
}

export async function createPendingPaymentOrder(params: {
  userId: string
  packageId?: string
  amountFen?: number
  outTradeNo: string
  payType: string
  provider: string
}): Promise<PendingPaymentOrder> {
  if (params.packageId) {
    const pkg = await prisma.topupPackage.findFirst({
      where: {
        id: params.packageId,
        enabled: true,
      },
    })

    if (!pkg) {
      throw new Error('充值套餐不存在或已下架')
    }

    return prisma.paymentOrder.create({
      data: {
        userId: params.userId,
        packageId: pkg.id,
        outTradeNo: params.outTradeNo,
        payType: params.payType,
        provider: params.provider,
        amountFen: pkg.priceFen,
        creditFen: pkg.creditFen + pkg.bonusFen,
        metadata: {
          packageName: pkg.name,
          baseCreditFen: pkg.creditFen,
          bonusFen: pkg.bonusFen,
        },
      } as unknown as Prisma.PaymentOrderUncheckedCreateInput,
      include: {
        topupPackage: true,
      },
    }) as unknown as PendingPaymentOrder
  }

  if (typeof params.amountFen !== 'number' || !Number.isInteger(params.amountFen) || params.amountFen <= 0) {
    throw new Error('充值金额不合法')
  }

  const amountFen = params.amountFen

  return prisma.paymentOrder.create({
    data: {
      userId: params.userId,
      packageId: null as unknown as string,
      outTradeNo: params.outTradeNo,
      status: PaymentOrderStatus.PENDING,
      amountFen,
      creditFen: amountFen,
      currency: 'CNY',
      payType: params.payType,
      provider: params.provider,
      payUrl: '',
      payUrl2: '',
      qrcodeUrl: '',
      qrcodeImg: '',
      metadata: {
        source: 'custom_topup',
        displayName: '自由充值',
      },
    } as Prisma.PaymentOrderUncheckedCreateInput,
    include: {
      topupPackage: true,
    },
  }) as unknown as PendingPaymentOrder
}

export async function updatePaymentOrderAfterCreate(params: {
  outTradeNo: string
  status: PaymentOrderStatus
  providerOrderId?: string | null
  payUrl?: string
  payUrl2?: string
  qrcodeUrl?: string
  qrcodeImg?: string
  metadata?: unknown
}) {
  return prisma.paymentOrder.update({
    where: { outTradeNo: params.outTradeNo },
    data: {
      status: params.status,
      providerOrderId: params.providerOrderId ?? null,
      payUrl: params.payUrl ?? '',
      payUrl2: params.payUrl2 ?? '',
      qrcodeUrl: params.qrcodeUrl ?? '',
      qrcodeImg: params.qrcodeImg ?? '',
      metadata: toNullableJsonValue(params.metadata),
    },
    include: {
      topupPackage: true,
    },
  })
}

export async function getPaymentOrderForUser(params: { userId: string; outTradeNo: string }) {
  return prisma.paymentOrder.findFirst({
    where: {
      userId: params.userId,
      outTradeNo: params.outTradeNo,
    },
    include: {
      topupPackage: true,
    },
  })
}

export async function getPaymentOrderByOutTradeNo(outTradeNo: string) {
  return prisma.paymentOrder.findUnique({
    where: { outTradeNo },
    include: {
      topupPackage: true,
    },
  })
}

export async function listPaymentOrders(params: {
  userId?: string
  status?: PaymentOrderStatus
  q?: string
  limit: number
}) {
  const where: Prisma.PaymentOrderWhereInput = {}

  if (params.userId) {
    where.userId = params.userId
  }

  if (params.status) {
    where.status = params.status
  }

  if (params.q?.trim()) {
    const query = params.q.trim()
    where.OR = [
      { outTradeNo: { contains: query, mode: 'insensitive' } },
      { providerOrderId: { contains: query, mode: 'insensitive' } },
      { user: { is: { email: { contains: query, mode: 'insensitive' } } } },
    ]
  }

  return prisma.paymentOrder.findMany({
    where,
    include: {
      user: {
        select: { id: true, email: true, name: true, role: true },
      },
      topupPackage: true,
      balanceLogs: {
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: params.limit,
  })
}

export async function applyPaymentOrderSuccess(params: {
  outTradeNo: string
  providerOrderId?: string | null
  paidAmountFen: number
  notifyPayload?: unknown
  paidAt?: Date
}) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.paymentOrder.findUnique({
      where: { outTradeNo: params.outTradeNo },
      include: {
        topupPackage: true,
      },
    })

    if (!order) {
      throw new Error('订单不存在')
    }

    if (order.amountFen !== params.paidAmountFen) {
      throw new Error('支付金额与订单金额不一致')
    }

    const idempotencyKey = `payment:${order.id}`
    const existingLog = await tx.balanceLog.findUnique({
      where: { idempotencyKey },
    })
    const effectivePaidAt = params.paidAt ?? new Date()

    if (existingLog) {
      if (order.status !== PaymentOrderStatus.PAID) {
        await tx.paymentOrder.update({
          where: { id: order.id },
          data: {
            status: PaymentOrderStatus.PAID,
            providerOrderId: params.providerOrderId ?? order.providerOrderId,
            notifyPayload: toNullableJsonValue(
              params.notifyPayload === undefined ? order.notifyPayload : params.notifyPayload,
            ),
            paidAt: order.paidAt ?? effectivePaidAt,
          },
        })
      }
      return existingLog
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: order.userId },
      select: { balanceFen: true },
    })
    const nextBalanceFen = user.balanceFen + order.creditFen

    const balanceLog = await tx.balanceLog.create({
      data: {
        userId: order.userId,
        paymentOrderId: order.id,
        amountFen: order.creditFen,
        balanceAfterFen: nextBalanceFen,
        status: 'PAYMENT_RECHARGE',
        reason: `payment_recharge:${order.outTradeNo}`,
        idempotencyKey,
      },
    })

    await tx.user.update({
      where: { id: order.userId },
      data: { balanceFen: nextBalanceFen },
    })

    await tx.paymentOrder.update({
      where: { id: order.id },
      data: {
        status: PaymentOrderStatus.PAID,
        providerOrderId: params.providerOrderId ?? order.providerOrderId,
        notifyPayload: toNullableJsonValue(
          params.notifyPayload === undefined ? order.notifyPayload : params.notifyPayload,
        ),
        paidAt: effectivePaidAt,
      },
    })

    await createAuditLog({
      actorUserId: order.userId,
      targetUserId: order.userId,
      action: 'payment.order_paid',
      resourceType: 'payment_order',
      resourceId: order.id,
      metadata: {
        outTradeNo: order.outTradeNo,
        amountFen: order.amountFen,
        creditFen: order.creditFen,
      },
    })

    return balanceLog
  })
}

export async function settlePaymentOrderManually(params: {
  orderId: string
  adminUserId: string
}) {
  const order = await prisma.paymentOrder.findUnique({
    where: { id: params.orderId },
    select: {
      id: true,
      outTradeNo: true,
      amountFen: true,
      providerOrderId: true,
    },
  })

  if (!order) {
    throw new Error('订单不存在')
  }

  await applyPaymentOrderSuccess({
    outTradeNo: order.outTradeNo,
    providerOrderId: order.providerOrderId,
    paidAmountFen: order.amountFen,
    notifyPayload: {
      source: 'manual_settle',
      settledBy: params.adminUserId,
      settledAt: new Date().toISOString(),
    },
    paidAt: new Date(),
  })

  await createAuditLog({
    actorUserId: params.adminUserId,
    action: 'payment.order_settled_manually',
    resourceType: 'payment_order',
    resourceId: order.id,
    metadata: {
      outTradeNo: order.outTradeNo,
      amountFen: order.amountFen,
    },
  })
}
