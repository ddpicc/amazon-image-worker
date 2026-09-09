import { prisma } from '@/lib/db/prisma'
import { fenToYuan } from '@/lib/money'
import { is2KRenderSize, isValidOfficialRenderSize } from '@/lib/image-options'

export type PricingSkuCode = 'image_1k' | 'image_2k'

export interface ModelPricingDefaults {
  model: string
  prices: Array<{ sku: PricingSkuCode; label: string; priceFen: number }>
  enabled: boolean
}

const DEFAULT_MODEL_PRICING: ModelPricingDefaults[] = [
  {
    model: 'gpt-image-2',
    prices: [
      { sku: 'image_1k', label: 'Image 1K', priceFen: 30 },
      { sku: 'image_2k', label: 'Image 2K', priceFen: 60 },
    ],
    enabled: true,
  },
  {
    model: 'agnes-image-2.5-flash',
    prices: [
      { sku: 'image_1k', label: 'Image 1K', priceFen: 30 },
      { sku: 'image_2k', label: 'Image 2K', priceFen: 60 },
    ],
    enabled: true,
  },
]

export interface PublicPriceRow {
  model: string
  sku: PricingSkuCode
  label: string
  priceFen: number
  enabled: boolean
}

export const COMMON_SIZE_EXAMPLES = new Set([
  '1024x1024', '1600x1600', '2048x2048',
  '1536x1024', '2048x1360',
  '1024x1536', '1360x2048',
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

function normalizePricingModel(model: string): string {
  const normalized = model.trim().toLowerCase()
  if (!normalized) throw new Error('model is required for pricing')
  return normalized
}

function getDefaultPricingForModel(model: string): ModelPricingDefaults {
  const normalized = normalizePricingModel(model)
  return DEFAULT_MODEL_PRICING.find((entry) => entry.model === normalized) ?? {
    model: normalized,
    prices: [
      { sku: 'image_1k', label: 'Image 1K', priceFen: 0 },
      { sku: 'image_2k', label: 'Image 2K', priceFen: 0 },
    ],
    enabled: false,
  }
}

export async function ensureDefaultPricingSkus(updatedBy?: string) {
  const providers = await prisma.imageProvider.findMany({
    select: { publicModel: true },
    distinct: ['publicModel'],
  })
  const models = new Set([
    ...DEFAULT_MODEL_PRICING.map((entry) => entry.model),
    ...providers.map((provider) => provider.publicModel),
  ])
  const existing = await prisma.pricingSku.findMany({
    select: { model: true, sku: true },
  })
  const existingSkus = new Set(existing.map((row) => `${row.model}:${row.sku}`))
  const missing = [...models].flatMap((model) => {
    const defaults = getDefaultPricingForModel(model)
    return defaults.prices
      .filter((row) => !existingSkus.has(`${defaults.model}:${row.sku}`))
      .map((row) => ({ ...row, model: defaults.model, enabled: defaults.enabled }))
  })

  if (missing.length === 0) return []

  return prisma.$transaction(async (tx) => {
    const created = []
    for (const row of missing) {
      const sku = await tx.pricingSku.create({
        data: {
          model: row.model,
          sku: row.sku,
          label: row.label,
          priceFen: row.priceFen,
          enabled: row.enabled,
          updatedBy: updatedBy || 'system',
        },
      })
      await tx.pricingSkuPriceHistory.create({
        data: {
          pricingSkuId: sku.id,
          model: sku.model,
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
    orderBy: [{ model: 'asc' }, { sku: 'asc' }],
  })
}

export async function batchSetPricingSkus(
  entries: Array<{ model: string; sku: PricingSkuCode; priceFen: number; enabled?: boolean }>,
  updatedBy: string,
) {
  await ensureDefaultPricingSkus(updatedBy)

  return prisma.$transaction(async (tx) => {
    const updated = []
    for (const entry of entries) {
      const existing = await tx.pricingSku.findUnique({
        where: { model_sku: { model: normalizePricingModel(entry.model), sku: entry.sku } },
      })
      if (!existing) {
        throw new Error(`Unknown pricing sku: ${entry.sku}`)
      }

      const priceChanged = existing.priceFen !== entry.priceFen
      const enabledChanged = entry.enabled !== undefined && existing.enabled !== entry.enabled
      const nextVersion = priceChanged || enabledChanged ? existing.version + 1 : existing.version

      const row = await tx.pricingSku.update({
        where: { model_sku: { model: normalizePricingModel(entry.model), sku: entry.sku } },
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
            model: row.model,
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

export async function lookupPricingForModelAndSize(model: string, size: string): Promise<{
  model: string
  sku: PricingSkuCode
  unitPriceFen: number
  unitPrice: number
  priceVersion: number
} | null> {
  const normalizedModel = normalizePricingModel(model)
  const sku = resolvePricingSkuForSize(size)
  if (!sku) return null

  await ensureDefaultPricingSkus()
  const row = await prisma.pricingSku.findUnique({
    where: { model_sku: { model: normalizedModel, sku } },
  })
  if (!row || !row.enabled) return null

  return {
    model: row.model,
    sku: row.sku as PricingSkuCode,
    unitPriceFen: row.priceFen,
    unitPrice: fenToYuan(row.priceFen),
    priceVersion: row.version,
  }
}

export function resolvePricingTierForSize(size: string): PricingSkuCode {
  return is2KRenderSize(size) ? 'image_2k' : 'image_1k'
}

export async function listPublicPrices(): Promise<PublicPriceRow[]> {
  const fallback = DEFAULT_MODEL_PRICING.flatMap((model) => model.prices.map((row) => ({
    model: model.model,
    ...row,
    enabled: model.enabled,
  })))

  try {
    await ensureDefaultPricingSkus()
    const rows = await prisma.pricingSku.findMany({
      orderBy: [{ model: 'asc' }, { sku: 'asc' }],
    })
    if (rows.length === 0) return fallback

    return rows.map((row) => ({
      sku: row.sku as PricingSkuCode,
      model: row.model,
      label: row.label,
      priceFen: row.priceFen,
      enabled: row.enabled,
    }))
  } catch {
    return fallback
  }
}
