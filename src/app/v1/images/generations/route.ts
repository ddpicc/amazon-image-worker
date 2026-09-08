import { NextRequest, NextResponse } from 'next/server'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { lookupPricingForModelAndSize, resolvePublicImageSize } from '@/lib/billing/price-service'
import { buildSyncImageResponse } from '@/lib/image-sync-response'
import type { RenderSize } from '@/lib/image-options'
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit'
import { SubmitImageTaskError, submitBillableImageTaskSync } from '@/lib/image-task-submission'
import { listPublicImageModels, resolvePublicImageModel } from '@/lib/image-models'

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
      model: requestedModel,
      prompt,
      size = '1024x1024',
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

    const model = await resolvePublicImageModel(requestedModel)
    if (!model) {
      const availableModels = await listPublicImageModels()
      return NextResponse.json(
        { error: `Model not supported. Available models: ${availableModels.join(', ') || 'none'}` },
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
        { error: 'Unsupported size. Use a widthxheight resolution meeting GPT-Image-2 constraints. auto is not supported.' },
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

    const pricing = await lookupPricingForModelAndSize(model, resolvedSize)
    if (pricing === null) {
      return NextResponse.json(
        { error: `No pricing configured for model ${model} and size ${resolvedSize}` },
        { status: 400 },
      )
    }

    const totalCostFen = pricing.unitPriceFen * n
    const submitResult = await submitBillableImageTaskSync({
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
      model,
      prompt: prompt.trim(),
      originalPrompt: prompt.trim(),
      entryApi: 'openai-images-generations-sync',
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
      totalCostFen,
      pricingSku: pricing.sku,
      unitPriceFen: pricing.unitPriceFen,
      priceVersion: pricing.priceVersion,
      idempotencyKey: request.headers.get('idempotency-key'),
    })

    return NextResponse.json(
      buildSyncImageResponse(submitResult.task, submitResult.idempotent),
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
