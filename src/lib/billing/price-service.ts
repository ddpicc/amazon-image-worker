import { prisma } from '@/lib/db/prisma'
import { fenToYuan } from '@/lib/money'
import { is2KRenderSize, isValidOfficialRenderSize } from '@/lib/image-options'

export type PricingSkuCode = 'image_1k' | 'image_2k'

const DEFAULT_SKU_PRICES: Array<{ sku: PricingSkuCode; label: string; priceFen: number }> = [
  { sku: 'image_1k', label: 'Image 1K', priceFen: 30 },
  { sku: 'image_2k', label: 'Image 2K', priceFen: 60 },
]

const PUBLIC_SKUS: PricingSkuCode[] = ['image_1k', 'image_2k']

export interface PublicPriceRow {
  sku: PricingSkuCode
  label: string
  priceFen: number
  enabled: boolean
}

export const COMMON_SIZE_EXAMPLES = new Set([
  '1024x1024', '2048x2048',
  '1536x1024', '2048x1365',
  '1024x1536', '1365x2048',
  '1152x1536', '1152x1920',
  '1536x960', '1024x640',
])

export function resolvePublicImageSize(sizeParam: unknown): string | null {
  if (typeof sizeParam !== 'string') return null
  const trimmed = sizeParam.trim()
  if (!trimmed) return null

  const normalized = trimmed.replace(/×/g, 'x').toLowerCase()
  if (isValidOfficialRenderSize(normalized)) {
    return normalized
  }

  return null
}

export function resolvePricingSkuForSize(size: string): PricingSkuCode | null {
  const normalized = size.trim().replace(/×/g, 'x').toLowerCase()
  if (!isValidOfficialRenderSize(normalized)) return null
  return is2KRenderSize(normalized) ? 'image_2k' : 'image_1k'
}

export async function ensureDefaultPricingSkus(updatedBy?: string) {
  const existing = await prisma.pricingSku.findMany({ select: { sku: true } })
  const existingSkus = new Set(existing.map((row) => row.sku))
  const missing = DEFAULT_SKU_PRICES.filter((row) => !existingSkus.has(row.sku))

  if (missing.length === 0) return []

  return prisma.$transaction(async (tx) => {
    const created = []
    for (const row of missing) {
      const sku = await tx.pricingSku.create({
        data: {
          sku: row.sku,
          label: row.label,
          priceFen: row.priceFen,
          enabled: true,
          updatedBy: updatedBy || 'system',
        },
      })
      await tx.pricingSkuPriceHistory.create({
        data: {
          pricingSkuId: sku.id,
          sku: sku.sku,
          version: sku.version,
          priceFen: sku.priceFen,
          enabled: sku.enabled,
          updatedBy: sku.updatedBy,
        },
      })
      created.push(sku)
    }
    return created
  })
}

export async function listPricingSkus() {
  await ensureDefaultPricingSkus()
  return prisma.pricingSku.findMany({
    orderBy: { sku: 'asc' },
  })
}

export async function batchSetPricingSkus(
  entries: Array<{ sku: string; priceFen: number; enabled?: boolean }>,
  updatedBy: string,
) {
  await ensureDefaultPricingSkus(updatedBy)

  return prisma.$transaction(async (tx) => {
    const updated = []
    for (const entry of entries) {
      const existing = await tx.pricingSku.findUnique({
        where: { sku: entry.sku },
      })
      if (!existing) {
        throw new Error(`Unknown pricing sku: ${entry.sku}`)
      }

      const priceChanged = existing.priceFen !== entry.priceFen
      const enabledChanged = entry.enabled !== undefined && existing.enabled !== entry.enabled
      const nextVersion = priceChanged || enabledChanged ? existing.version + 1 : existing.version

      const row = await tx.pricingSku.update({
        where: { sku: entry.sku },
        data: {
          priceFen: entry.priceFen,
          ...(entry.enabled !== undefined ? { enabled: entry.enabled } : {}),
          version: nextVersion,
          updatedBy,
        },
      })

      if (nextVersion !== existing.version) {
        await tx.pricingSkuPriceHistory.create({
          data: {
            pricingSkuId: row.id,
            sku: row.sku,
            version: row.version,
            priceFen: row.priceFen,
            enabled: row.enabled,
            updatedBy,
          },
        })
      }

      updated.push(row)
    }
    return updated
  })
}

export async function lookupPricingForSize(size: string): Promise<{
  sku: PricingSkuCode
  unitPriceFen: number
  unitPrice: number
  priceVersion: number
} | null> {
  const sku = resolvePricingSkuForSize(size)
  if (!sku) return null

  const row = await prisma.pricingSku.findUnique({
    where: { sku },
  })
  if (!row || !row.enabled) return null

  return {
    sku,
    unitPriceFen: row.priceFen,
    unitPrice: fenToYuan(row.priceFen),
    priceVersion: row.version,
  }
}

export function resolvePricingTierForSize(size: string): PricingSkuCode {
  return is2KRenderSize(size) ? 'image_2k' : 'image_1k'
}

export async function listPublicPrices(): Promise<PublicPriceRow[]> {
  const fallback = DEFAULT_SKU_PRICES.map((row) => ({ ...row, enabled: true }))

  try {
    const rows = await prisma.pricingSku.findMany({
      where: { sku: { in: PUBLIC_SKUS } },
      orderBy: { sku: 'asc' },
    })
    if (rows.length === 0) return fallback

    return rows.map((row) => ({
      sku: row.sku as PricingSkuCode,
      label: row.label,
      priceFen: row.priceFen,
      enabled: row.enabled,
    }))
  } catch {
    return fallback
  }
}
