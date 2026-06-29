export const CURRENCY_CODE = 'CNY'

export function yuanToFen(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Invalid money value')
  }

  return Math.round(value * 100)
}

export function fenToYuan(value: number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0
  }

  return value / 100
}

export function formatFen(value: number | null | undefined): string {
  return `¥${fenToYuan(value).toFixed(2)}`
}

export function ensureFen(value: number): number {
  if (!Number.isInteger(value)) {
    throw new Error('Money amount must be stored in fen as an integer')
  }

  return value
}
