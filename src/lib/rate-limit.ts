import Redis from 'ioredis'
import { NextRequest, NextResponse } from 'next/server'

interface RateLimitOptions {
  key: string
  limit: number
  windowSeconds: number
}

interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  retryAfterSeconds: number
}

const memoryBuckets = new Map<string, { count: number; resetAt: number }>()
let redisClient: Redis | null = null

function getRedisClient() {
  if (!process.env.REDIS_URL) return null
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
    })
    redisClient.on('error', (error) => {
      console.error('[rate-limit] redis error', { error: error.message })
    })
  }
  return redisClient
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000)
}

function memoryRateLimit(options: RateLimitOptions): RateLimitResult {
  const now = Date.now()
  const existing = memoryBuckets.get(options.key)
  const bucket = existing && existing.resetAt > now
    ? existing
    : { count: 0, resetAt: now + options.windowSeconds * 1000 }

  bucket.count += 1
  memoryBuckets.set(options.key, bucket)

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  return {
    allowed: bucket.count <= options.limit,
    limit: options.limit,
    remaining: Math.max(0, options.limit - bucket.count),
    retryAfterSeconds,
  }
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const redis = getRedisClient()
  if (!redis) {
    return memoryRateLimit(options)
  }

  const namespacedKey = `rate-limit:${options.key}`
  try {
    const count = await redis.incr(namespacedKey)
    if (count === 1) {
      await redis.expire(namespacedKey, options.windowSeconds)
    }
    const ttl = await redis.ttl(namespacedKey)
    const retryAfterSeconds = ttl > 0 ? ttl : options.windowSeconds

    return {
      allowed: count <= options.limit,
      limit: options.limit,
      remaining: Math.max(0, options.limit - count),
      retryAfterSeconds,
    }
  } catch (error) {
    console.error('[rate-limit] falling back to memory limiter', {
      error: error instanceof Error ? error.message : String(error),
    })
    return memoryRateLimit(options)
  }
}

export function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    forwardedFor ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

export async function enforceRateLimit(
  request: NextRequest,
  options: RateLimitOptions,
): Promise<NextResponse | null> {
  const result = await checkRateLimit(options)
  if (result.allowed) {
    return null
  }

  return NextResponse.json(
    {
      error: 'Too many requests',
      code: 'rate_limited',
      retry_after: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
      },
    },
  )
}

