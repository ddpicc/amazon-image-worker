export const CURRENCY_CODE = 'CNY'

export function yuanToFen(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Invalid money value')
  }

  return Math.round(value * 100)
}

export function parseYuanToFen(value: string): number {
  const normalized = value.trim()
  if (!normalized) {
    throw new Error('请输入充值金额')
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error('充值金额格式不正确，最多支持两位小数')
  }

  const [yuanPart, fenPart = ''] = normalized.split('.')
  const yuan = Number(yuanPart)
  const fen = Number((fenPart + '00').slice(0, 2))

  if (!Number.isFinite(yuan) || yuan < 0) {
    throw new Error('充值金额必须大于 0')
  }

  const totalFen = yuan * 100 + fen
  if (!Number.isInteger(totalFen) || totalFen <= 0) {
    throw new Error('充值金额必须大于 0')
  }

  return totalFen
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
