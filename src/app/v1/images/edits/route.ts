import { NextRequest, NextResponse } from 'next/server'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { lookupPricingForModelAndSize, resolvePublicImageSize } from '@/lib/billing/price-service'
import { checkBalance } from '@/lib/billing/billing-service'
import { fenToYuan } from '@/lib/money'
import { buildSyncImageResponse } from '@/lib/image-sync-response'
import type { RenderSize } from '@/lib/image-options'
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit'
import { SubmitImageTaskError, submitBillableImageTaskSync } from '@/lib/image-task-submission'
import { RemoteReferenceImageError, storeRemoteReferenceImages } from '@/lib/remote-reference-images'
import { listPublicImageModels, resolvePublicImageModel } from '@/lib/image-models'

function isHttpsUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
  } catch {
    return false
  }
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const ipRateLimitResponse = await enforceRateLimit(request, {
      key: `images:edits:ip:${getClientIp(request)}`,
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
      key: `images:edits:key:${auth.apiKeyId}`,
      limit: 60,
      windowSeconds: 60,
    })
    if (apiKeyRateLimitResponse) return apiKeyRateLimitResponse

    const body = await request.json()
    const {
      model: requestedModel,
      prompt,
      image,
      size = '1024x1024',
      n = 1,
      callback_url,
      mask_url,
    } = body as {
      model?: string
      prompt?: string
      image?: string[]
      size?: string
      n?: number
      callback_url?: string
      mask_url?: string
    }

    if (mask_url !== undefined) {
      return NextResponse.json(
        { error: 'mask_url is not supported' },
        { status: 400 },
      )
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

    if (!Array.isArray(image) || image.length === 0) {
      return NextResponse.json(
        { error: 'image is required, at least 1 image must be provided' },
        { status: 400 },
      )
    }

    if (image.length > 16) {
      return NextResponse.json(
        { error: 'image supports up to 16 images' },
        { status: 400 },
      )
    }

    for (const url of image) {
      if (typeof url !== 'string' || !isValidHttpUrl(url)) {
        return NextResponse.json(
          { error: 'image must contain valid http/https URLs' },
          { status: 400 },
        )
      }
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
    const balanceCheck = await checkBalance(auth.userId, totalCostFen)
    if (!balanceCheck.sufficient) {
      return NextResponse.json(
        {
          error: 'Insufficient balance',
          code: 'insufficient_balance',
          balance: fenToYuan(balanceCheck.currentBalanceFen),
          balance_fen: balanceCheck.currentBalanceFen,
          required: fenToYuan(totalCostFen),
          required_fen: totalCostFen,
        },
        { status: 402 },
      )
    }

    const storedReferenceImages = await storeRemoteReferenceImages(image)

    const submitResult = await submitBillableImageTaskSync({
      userId: auth.userId,
      apiKeyId: auth.apiKeyId,
      model,
      prompt: prompt.trim(),
      originalPrompt: prompt.trim(),
      entryApi: 'openai-images-edits-sync',
      imageType: 'edit',
      aspectRatio: null,
      size: resolvedSize as RenderSize,
      referenceImages: storedReferenceImages,
      metadata: {
        source: 'openai-compatible',
        model,
        requestedSize: size,
        n,
        image,
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
    if (error instanceof RemoteReferenceImageError) {
      return NextResponse.json(
        {
          error: 'Invalid reference image',
          code: error.code,
        },
        { status: 400 },
      )
    }
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
