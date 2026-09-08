import { ErrorType } from '@prisma/client'

interface HttpErrorLike {
  status?: number
  statusCode?: number
  message?: string
  code?: string
}

export function classifyError(error: unknown): ErrorType {
  // Extract HTTP status and message from various error shapes
  const status = (error as HttpErrorLike)?.status ?? (error as HttpErrorLike)?.statusCode
  const message = (error as HttpErrorLike)?.message ?? ''
  const code = (error as HttpErrorLike)?.code ?? ''
  const msgLower = message.toLowerCase()

  // Auth errors
  if (status === 401 || status === 403) return 'AUTH_FAILURE'

  // Rate limit
  if (status === 429) return 'RATE_LIMIT'
  if (msgLower.includes('rate limit') || msgLower.includes('too many requests')) return 'RATE_LIMIT'

  // Timeout
  if (status === 408 || status === 504) return 'TIMEOUT'
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'UND_ERR_CONNECT_TIMEOUT') return 'TIMEOUT'
  if (msgLower.includes('timeout') || msgLower.includes('timed out')) return 'TIMEOUT'

  // Request validation errors should not damage provider health. Keep this
  // focused on common parameter-validation responses; other 4xx errors may
  // still indicate a provider configuration problem.
  if (status === 400 || status === 422) return 'PARAMETER_ERROR'
  if (
    status && status >= 400 && status < 500 &&
    (msgLower.includes('invalid') || msgLower.includes('unsupported') || msgLower.includes('parameter') || msgLower.includes('validation') || msgLower.includes('size'))
  ) return 'PARAMETER_ERROR'

  // Network errors
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ENETUNREACH') return 'NETWORK_ERROR'
  if (msgLower.includes('network') || msgLower.includes('econnrefused')) return 'NETWORK_ERROR'

  // Provider errors (5xx)
  if (status && status >= 500) return 'PROVIDER_ERROR'

  return 'UNKNOWN'
}
