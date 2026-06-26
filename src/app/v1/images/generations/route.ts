import { NextRequest, NextResponse } from 'next/server'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { lookupPricingForSize, resolvePublicImageSize } from '@/lib/billing/price-service'
import type { RenderSize } from '@/lib/image-options'
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit'
import { SubmitImageTaskError, submitBillableImageTask } from '@/lib/image-task-submission'

const ALLOWED_MODELS = new Set(['gpt-image-2', 'agnes-image-2.1-flash'])
const ALLOWED_QUALITIES = new Set(['low', 'medium', 'high'])

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const ipRateLimitResponse = await enforceRateLimit(request, {
      key: `images:generations:ip:${getClientIp(request)}`,
      limit: 120,
      windowSeconds: 60,
    })
    if (ipRateLimitResponse) return ipRateLimitResponse

    const result = await requireRequestAuth(request)
    if ('error' in result) {
      return result.error
    }

    const { auth } = result
    if (auth.authType !== 'api-key' || !auth.apiKeyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKeyRateLimitResponse = await enforceRateLimit(request, {
      key: `images:generations:key:${auth.apiKeyId}`,
      limit: 60,
      windowSeconds: 60,
    })
    if (apiKeyRateLimitResponse) return apiKeyRateLimitResponse

    const body = await request.json()
    const {
      model = 'gpt-image-2',
      prompt,
      size = 'auto',
      quality = 'medium',
      n = 1,
      callback_url,
    } = body as {
      model?: string
      prompt?: string
      size?: string
      quality?: string
      n?: number
      callback_url?: string
    }

    if (!ALLOWED_MODELS.has(model)) {
      return NextResponse.json(
        { error: `Model not supported. Use one of: ${[...ALLOWED_MODELS].join(', ')}` },
        { status: 400 },
      )
    }

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 })
    }

    if (prompt.length > 32000) {
      return NextResponse.json(
        { error: 'prompt exceeds 32000 characters' },
        { status: 400 },
      )
    }

    if (!Number.isInteger(n) || n < 1 || n > 10) {
      return NextResponse.json(
        { error: 'n must be an integer between 1 and 10' },
        { status: 400 },
      )
    }

    if (n !== 1) {
      return NextResponse.json(
        { error: 'Only n=1 is supported currently' },
        { status: 400 },
      )
    }

    if (typeof quality !== 'string' || !ALLOWED_QUALITIES.has(quality)) {
      return NextResponse.json(
        { error: 'quality must be one of low, medium, high' },
        { status: 400 },
      )
    }

    const resolvedSize = resolvePublicImageSize(size)
    if (!resolvedSize) {
      return NextResponse.json(
        { error: 'Unsupported size. Use a valid pixel size (e.g., "1024x1024") or aspect ratio (e.g., "1:1", "16:9").' },
        { status: 400 },
      )
    }

    if (callback_url !== undefined) {
      if (typeof callback_url !== 'string' || !isHttpsUrl(callback_url)) {
        return NextResponse.json(
          { error: 'callback_url must be a valid HTTPS URL' },
          { status: 400 },
        )
      }
      if (callback_url.length > 2048) {
        return NextResponse.json(
          { error: 'callback_url exceeds 2048 characters' },
          { status: 400 },
        )
      }
    }

    const pricing = await lookupPricingForSize(resolvedSize)
    if (pricing === null) {
      return NextResponse.json(
        { error: `No pricing configured for size ${resolvedSize}` },
        { status: 400 },
      )
    }

    const totalCost = pricing.unitPrice * n
    const submitResult = await submitBillableImageTask({
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
      model,
      prompt: prompt.trim(),
      originalPrompt: prompt.trim(),
      entryApi: 'openai-images-generations',
      imageType: 'generate',
      aspectRatio: null,
      size: resolvedSize as RenderSize,
      referenceImages: [],
      metadata: {
        source: 'openai-compatible',
        model,
        quality,
        requestedSize: size,
        n,
      },
      callbackUrl: callback_url ?? null,
      totalCost,
      pricingSku: pricing.sku,
      unitPrice: pricing.unitPrice,
      priceVersion: pricing.priceVersion,
      idempotencyKey: request.headers.get('idempotency-key'),
    })

    return NextResponse.json(
      {
        created: Math.floor(Date.now() / 1000),
        id: submitResult.requestId,
        model,
        object: 'image.generation.task',
        progress: 0,
        status: 'pending',
        task_info: {
          type: 'image',
        },
        usage: {
          sku: submitResult.pricingSku,
          unit_price: submitResult.unitPrice,
          price_version: submitResult.priceVersion,
          total_cost: submitResult.totalCost,
          currency: 'USD',
        },
        idempotent: submitResult.idempotent,
      },
      { status: 202 },
    )
  } catch (error) {
    if (error instanceof SubmitImageTaskError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          ...(error.details ?? {}),
        },
        { status: error.status },
      )
    }
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
