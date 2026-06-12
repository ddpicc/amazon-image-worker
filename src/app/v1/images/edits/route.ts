import { NextRequest, NextResponse } from 'next/server'
import { checkAndIncrementQuota } from '@/lib/auth/quota-service'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { createQueuedImageGenerationRequest } from '@/lib/image-generation-service'
import { enqueueImageGeneration } from '@/lib/image-generation-worker-queue'
import { checkBalance, deductBalance } from '@/lib/billing/billing-service'
import { resolvePublicImageSize } from '@/lib/billing/price-service'
import { lookupSizePrice } from '@/lib/billing/billing-service'
import type { RenderSize } from '@/lib/image-options'

const ALLOWED_MODEL = 'gpt-image-2'

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
    const result = await requireRequestAuth(request)
    if ('error' in result) {
      return result.error
    }

    const { auth } = result
    if (auth.authType !== 'api-key' || !auth.apiKeyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      model = ALLOWED_MODEL,
      prompt,
      image,
      size = 'auto',
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

    if (model !== ALLOWED_MODEL) {
      return NextResponse.json(
        { error: `Only model=${ALLOWED_MODEL} is supported` },
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

    const quotaResult = await checkAndIncrementQuota(auth.apiKeyId)
    if (!quotaResult.allowed) {
      return NextResponse.json(
        { error: quotaResult.reason || 'Quota exceeded' },
        { status: 429 },
      )
    }

    const unitPrice = await lookupSizePrice(resolvedSize)
    if (unitPrice === null) {
      return NextResponse.json(
        { error: `No pricing configured for size ${resolvedSize}` },
        { status: 400 },
      )
    }

    const totalCost = unitPrice * n
    const balanceCheck = await checkBalance(auth.userId, totalCost)
    if (!balanceCheck.sufficient) {
      return NextResponse.json(
        {
          error: 'Insufficient balance',
          code: 'insufficient_balance',
          balance: balanceCheck.currentBalance,
          required: totalCost,
        },
        { status: 402 },
      )
    }

    const submitResult = await createQueuedImageGenerationRequest({
      apiKeyId: auth.apiKeyId,
      prompt: prompt.trim(),
      originalPrompt: prompt.trim(),
      entryApi: 'openai-images-edits',
      imageType: 'edit',
      aspectRatio: null,
      size: resolvedSize as RenderSize,
      referenceImages: image.map((url, index) => ({
        url,
        key: `remote-ref-${index}`,
        mimeType: 'image/png',
        bytes: 0,
        name: `reference-${index}`,
      })),
      metadata: {
        source: 'openai-compatible',
        model,
        requestedSize: size,
        n,
        image,
      },
      callbackUrl: callback_url ?? null,
    })

    await deductBalance(
      auth.userId,
      totalCost,
      submitResult.requestId,
    )

    await enqueueImageGeneration({ requestId: submitResult.requestId })

    return NextResponse.json(
      {
        created: Math.floor(Date.now() / 1000),
        id: submitResult.requestId,
        model: ALLOWED_MODEL,
        object: 'image.edit.task',
        progress: 0,
        status: 'pending',
        task_info: {
          type: 'image',
        },
        usage: {
          unit_price: unitPrice,
          total_cost: totalCost,
          currency: 'USD',
        },
      },
      { status: 202 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
