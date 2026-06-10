import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { SIZE_OPTIONS, HIDDEN_APLUS_RENDER_SIZE } from '@/lib/image-options'

// Default price per image (USD)
const DEFAULT_PRICE = 0.04

// All valid RenderSize values
const ALL_SIZES = [
  ...SIZE_OPTIONS.map((o) => o.value),
  HIDDEN_APLUS_RENDER_SIZE,
]

// ============================================================
// List
// ============================================================

export async function listSizePrices() {
  return prisma.sizePrice.findMany({
    orderBy: { size: 'asc' },
  })
}

// ============================================================
// Set (Upsert)
// ============================================================

export async function setSizePrice(
  size: string,
  priceUsd: number,
  updatedBy: string,
) {
  return prisma.sizePrice.upsert({
    where: { size },
    update: {
      price: new Prisma.Decimal(priceUsd),
      updatedBy,
    },
    create: {
      size,
      price: new Prisma.Decimal(priceUsd),
      updatedBy,
    },
  })
}

// ============================================================
// Toggle enabled
// ============================================================

export async function toggleSizePrice(size: string, enabled: boolean) {
  return prisma.sizePrice.update({
    where: { size },
    data: { enabled },
  })
}

// ============================================================
// Batch upsert — set multiple prices at once
// ============================================================

export async function batchSetSizePrices(
  entries: Array<{ size: string; price: number; enabled?: boolean }>,
  updatedBy: string,
) {
  return prisma.$transaction(
    entries.map((e) =>
      prisma.sizePrice.upsert({
        where: { size: e.size },
        update: {
          price: new Prisma.Decimal(e.price),
          ...(e.enabled !== undefined ? { enabled: e.enabled } : {}),
          updatedBy,
        },
        create: {
          size: e.size,
          price: new Prisma.Decimal(e.price),
          enabled: e.enabled ?? true,
          updatedBy,
        },
      }),
    ),
  )
}

// ============================================================
// Seed defaults — create default price rows for all sizes
// ============================================================

export async function ensureDefaultSizePrices(updatedBy?: string) {
  const existing = await prisma.sizePrice.findMany({ select: { size: true } })
  const existingSizes = new Set(existing.map((r) => r.size))
  const missing = ALL_SIZES.filter((s) => !existingSizes.has(s))

  if (missing.length === 0) return []

  return prisma.$transaction(
    missing.map((size) =>
      prisma.sizePrice.create({
        data: {
          size,
          price: new Prisma.Decimal(DEFAULT_PRICE),
          enabled: true,
          updatedBy: updatedBy || 'system',
        },
      }),
    ),
  )
}

// ============================================================
// Size/Resolution/AspectRatio mapping helpers
// for the OpenAI/Evolink-compatible endpoint
// ============================================================

type Resolution = '1K' | '2K' | '4K'
type EvolinkSize = string // ratio like "1:1", "2:3", pixels like "1024x1024", or "auto"

interface SizeMapping {
  size: string
  price: number | null
}

// Map ratio + resolution to our RenderSize values
const RATIO_RESOLUTION_MAP: Record<string, Record<Resolution, string>> = {
  '1:1': {
    '1K': '1024x1024',
    '2K': '2048x2048',
    '4K': '2048x2048', // We don't have 2880x2880, cap at 2048
  },
  '3:2': {
    '1K': '1536x1024',
    '2K': '2048x1365',
    '4K': '2048x1365', // Cap at our max
  },
  '2:3': {
    '1K': '1024x1536',
    '2K': '1365x2048',
    '4K': '1365x2048',
  },
  '2:1': {
    '1K': '1024x640',
    '2K': '1024x640', // We don't have 2896x1456
    '4K': '1024x640',
  },
  '8:5': {
    '1K': '1024x640',
    '2K': '1536x960',
    '4K': '1536x960',
  },
  '16:9': {
    '1K': '1536x960',
    '2K': '1536x960',
    '4K': '1536x960',
  },
}

// Supported pixel sizes in our system
const VALID_PIXEL_SIZES = new Set([
  '1024x1024', '2048x2048',
  '1536x1024', '2048x1365',
  '1024x1536', '1365x2048',
  '1536x960', '1024x640',
])

/**
 * Resolve the Evolink/OpenAI-style size parameter + resolution
 * to our internal RenderSize.
 *
 * @returns The resolved size and whether it's supported, or null if unsupported
 */
export function resolveEvolinkSize(
  sizeParam: EvolinkSize,
  resolution: Resolution = '1K',
): string | null {
  if (!sizeParam || sizeParam === 'auto') {
    return '1024x1024' // default
  }

  // Direct pixel format: "1024x1024" or "1024×1024"
  const normalized = sizeParam.replace('×', 'x').toLowerCase()
  if (VALID_PIXEL_SIZES.has(normalized)) {
    return normalized
  }

  // Check if it's a pixel format we don't support
  if (/^\d+x\d+$/.test(normalized)) {
    // Unsupported pixel size
    return null
  }

  // Ratio format: "1:1", "2:3", "16:9", etc.
  const ratioMap = RATIO_RESOLUTION_MAP[normalized] || RATIO_RESOLUTION_MAP[sizeParam]
  if (ratioMap) {
    return ratioMap[resolution]
  }

  // Try to parse other ratio formats like "2:1" → check our map
  for (const [ratio, resMap] of Object.entries(RATIO_RESOLUTION_MAP)) {
    if (sizeParam === ratio) {
      return resMap[resolution]
    }
  }

  return null
}
