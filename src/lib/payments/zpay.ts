import { createHash } from 'node:crypto'

export type ZPayPayType = 'wxpay'

type ZPaySignInput = Record<string, string | number | null | undefined>

export function getZPayConfig() {
  const pid = process.env.ZPAY_PID?.trim() ?? ''
  const key = process.env.ZPAY_KEY?.trim() ?? ''
  const gateway = (process.env.ZPAY_GATEWAY?.trim() || 'https://zpayz.cn').replace(/\/+$/, '')

  if (!pid) {
    throw new Error('Missing environment variable: ZPAY_PID')
  }

  if (!key) {
    throw new Error('Missing environment variable: ZPAY_KEY')
  }

  return { pid, key, gateway }
}

export function normalizeMoneyFromFen(amountFen: number) {
  if (!Number.isInteger(amountFen) || amountFen <= 0) {
    throw new Error('充值金额不合法')
  }

  return (amountFen / 100).toFixed(2)
}

export function buildZPaySignSource(params: ZPaySignInput) {
  return Object.entries(params)
    .filter(([key, raw]) => key !== 'sign' && key !== 'sign_type' && raw !== null && raw !== undefined && String(raw) !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('&')
}

export function buildZPaySign(params: ZPaySignInput, key: string) {
  const source = buildZPaySignSource(params)
  return createHash('md5').update(`${source}${key}`).digest('hex').toLowerCase()
}

export function verifyZPaySign(params: ZPaySignInput, key: string, sign: string) {
  if (!sign) return false
  return buildZPaySign(params, key) === sign.toLowerCase()
}

export function parseZPayCode(value: unknown) {
  const asNumber = Number(value)
  if (Number.isFinite(asNumber)) {
    return asNumber
  }

  return 0
}
