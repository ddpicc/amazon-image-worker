import OpenAI from 'openai'
import { Prisma } from '@prisma/client'
import { uploadBufferToCos } from './cos'
import { decryptSecret } from './crypto'
import { StoredReferenceImage } from './amazon-workflow'
import { AspectRatio, RenderSize } from './image-options'
import { completeAiOperation, completeAiOperationAttempt, getAiOperationExpiryDate, startAiOperation, startAiOperationAttempt } from './ai-operations'
import { RouteSummary, PersistedImageGenerationPayload } from './image-generation'
import { selectProviders, markProviderSuccess, markProviderFailure } from './providers/provider-service'
import { classifyError } from './providers/error-classifier'
import { applyCooldown, clearCooldown } from './providers/cooldown'
import { checkCircuitBreaker } from './providers/circuit-breaker'
import { prisma } from './db/prisma'

export interface GenerateImageInput {
  apiKeyId: string
  prompt: string
  referenceImages: Array<{
    data: string
    mediaType: string
  }>
  size?: RenderSize
  aspectRatio?: AspectRatio
  imageType?: string
  entryApi?: string
  metadata?: Record<string, unknown>
  onStatus?: (message: string) => Promise<void> | void
}

export interface GenerateImageOutput {
  imageUrl: string
  revisedPrompt: string
  size: RenderSize
  aspectRatio?: AspectRatio
  requestId: string
  operationId: string
  routeSummary: RouteSummary
}

export class GenerateImageRouteError extends Error {
  routeSummary: RouteSummary

  constructor(message: string, routeSummary: RouteSummary) {
    super(message)
    this.name = 'GenerateImageRouteError'
    this.routeSummary = routeSummary
  }
}

const PROVIDER_TIMEOUT_MS = 240_000

function getExtensionFromMediaType(mediaType: string): string {
  if (mediaType === 'image/png') return 'png'
  if (mediaType === 'image/webp') return 'webp'
  if (mediaType === 'image/gif') return 'gif'
  if (mediaType === 'image/jpeg') return 'jpg'
  return 'bin'
}

function toImageFile(
  referenceImage: { data: string; mediaType: string },
  index: number,
): File {
  const imageBuffer = Buffer.from(referenceImage.data, 'base64')
  const extension = getExtensionFromMediaType(referenceImage.mediaType)
  return new File([imageBuffer], `reference-${Date.now()}-${index}.${extension}`, {
    type: referenceImage.mediaType || 'image/jpeg',
  })
}

function createOpenAIClient(apiKey: string, baseURL: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL,
    timeout: PROVIDER_TIMEOUT_MS,
  })
}

function getProviderBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}

function isEvolinkProvider(vendor: string, baseUrl: string): boolean {
  return vendor.toLowerCase() === 'evolink' || /evolink\.ai/i.test(baseUrl)
}

function buildImageEditParams(params: {
  model: string
  image: File[]
  prompt: string
  size: RenderSize
}) {
  return {
    model: params.model,
    image: params.image,
    prompt: params.prompt,
    n: 1,
    size: params.size,
    input_fidelity: 'high',
    quality: 'medium',
    response_format: 'url',
    output_format: 'png',
  } as any
}

function buildImageGenerateParams(params: {
  model: string
  prompt: string
  size: RenderSize
}) {
  return {
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size: params.size,
    quality: 'medium',
    response_format: 'url',
    output_format: 'png',
  } as any
}

function upstreamApiKindFromMode(mode: 'edit' | 'generate'): 'IMAGES_EDIT' | 'IMAGES_GENERATE' {
  return mode === 'edit' ? 'IMAGES_EDIT' : 'IMAGES_GENERATE'
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) {
    throw new Error('Invalid data URL returned from upstream image API')
  }

  return {
    mimeType: match[1] || 'image/png',
    buffer: Buffer.from(match[2], 'base64'),
  }
}

function parseBase64Payload(base64: string, mimeType = 'image/png'): { buffer: Buffer; mimeType: string } {
  return {
    buffer: Buffer.from(base64, 'base64'),
    mimeType,
  }
}

function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return AbortSignal.timeout(timeoutMs)
  }
  return undefined
}

async function withTimeout<T>(run: () => Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return Promise.race([
    run(),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(message))
      }, timeoutMs)
    }),
  ])
}

async function downloadRemoteImage(url: string, timeoutMs = PROVIDER_TIMEOUT_MS): Promise<{ buffer: Buffer; mimeType: string }> {
  const response = await fetch(url, {
    signal: createTimeoutSignal(timeoutMs),
  })
  if (!response.ok) {
    throw new Error(`Failed to download upstream image: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: response.headers.get('content-type') || 'image/png',
  }
}

async function extractUpstreamImage(imageData: any): Promise<{ buffer: Buffer; mimeType: string; returnedKind: 'data-url' | 'remote-url' | 'b64-json' }> {
  const rawImageUrl = imageData?.url || ''
  const b64Json = imageData?.b64_json || ''

  if (rawImageUrl.startsWith('data:')) {
    const parsed = parseDataUrl(rawImageUrl)
    return { ...parsed, returnedKind: 'data-url' }
  }

  if (rawImageUrl) {
    const downloaded = await downloadRemoteImage(rawImageUrl)
    return { ...downloaded, returnedKind: 'remote-url' }
  }

  if (b64Json) {
    return {
      ...parseBase64Payload(b64Json),
      returnedKind: 'b64-json',
    }
  }

  throw new Error('Upstream image response did not include url or b64_json')
}

function getExtensionFromMimeType(mimeType: string): string {
  return getExtensionFromMediaType(mimeType)
}

async function uploadReferenceImagesForProvider(params: {
  requestId: string
  referenceImages: Array<{ data: string; mediaType: string }>
}) {
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const env = process.env.NODE_ENV || 'development'

  return Promise.all(params.referenceImages.slice(0, 16).map(async (image, index) => {
    const buffer = Buffer.from(image.data, 'base64')
    const ext = getExtensionFromMimeType(image.mediaType)
    const key = `provider-inputs/${env}/${yyyy}/${mm}/${dd}/${params.requestId}-${index + 1}.${ext}`

    const uploaded = await uploadBufferToCos({
      buffer,
      key,
      contentType: image.mediaType || 'image/jpeg',
    })

    return uploaded.url
  }))
}

async function pollEvolinkTask(params: {
  baseUrl: string
  apiKey: string
  taskId: string
  timeoutMs?: number
  intervalMs?: number
}): Promise<{ status: string; results?: string[]; error?: { message?: string } }> {
  const timeoutMs = params.timeoutMs ?? PROVIDER_TIMEOUT_MS
  const intervalMs = params.intervalMs ?? 3_000
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const response = await fetch(`${getProviderBaseUrl(params.baseUrl)}/tasks/${params.taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
      },

      signal: createTimeoutSignal(timeoutMs),
    })

    const payload = await response.json().catch(() => null) as any
    if (!response.ok) {
      throw new Error(payload?.error?.message || payload?.message || `Evolink task query failed: ${response.status}`)
    }

    if (payload?.status === 'completed') {
      return payload
    }

    if (payload?.status === 'failed') {
      throw new Error(payload?.error?.message || payload?.message || 'Evolink task failed')
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }

  throw new Error('Evolink task timed out')
}

async function requestEvolinkImage(params: {
  requestId: string
  apiKey: string
  baseUrl: string
  model: string
  prompt: string
  size: RenderSize
  referenceImages: Array<{ data: string; mediaType: string }>
}): Promise<{ buffer: Buffer; mimeType: string; returnedKind: 'remote-url' }> {
  const imageUrls = params.referenceImages.length > 0
    ? await uploadReferenceImagesForProvider({
        requestId: params.requestId,
        referenceImages: params.referenceImages,
      })
    : []

  const createResponse = await fetch(`${getProviderBaseUrl(params.baseUrl)}/images/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      prompt: params.prompt,
      size: params.size,
      n: 1,
      ...(imageUrls.length > 0 ? { image_urls: imageUrls } : {}),
    }),
    signal: createTimeoutSignal(PROVIDER_TIMEOUT_MS),
  })

  const createPayload = await createResponse.json().catch(() => null) as any
  if (!createResponse.ok) {
    throw new Error(createPayload?.error?.message || createPayload?.message || `Evolink task creation failed: ${createResponse.status}`)
  }

  const taskId = createPayload?.id
  if (!taskId) {
    throw new Error('Evolink task creation did not return a task id')
  }

  const taskResult = await pollEvolinkTask({
    baseUrl: params.baseUrl,
    apiKey: params.apiKey,
    taskId,
  })

  const resultUrl = Array.isArray(taskResult.results) ? taskResult.results[0] : ''
  if (!resultUrl) {
    throw new Error('Evolink task completed without image results')
  }

  const downloaded = await downloadRemoteImage(resultUrl)
  return {
    buffer: downloaded.buffer,
    mimeType: downloaded.mimeType,
    returnedKind: 'remote-url',
  }
}

function buildCosKey(requestId: string, mimeType: string): string {
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const env = process.env.NODE_ENV || 'development'
  const ext = getExtensionFromMediaType(mimeType)
  return `generated/${env}/${yyyy}/${mm}/${dd}/${requestId}.${ext}`
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

function lineName(index: number) {
  const names = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']
  return names[index - 1] ? `第${names[index - 1]}线路` : `第${index}线路`
}

async function emitPersistedStatus(requestId: string, message: string) {
  await prisma.imageGenerationRequest.update({
    where: { id: requestId },
    data: { statusMessage: message },
  })
}

export async function createImageGenerationRequest(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const { apiKeyId, prompt, referenceImages, size = '1024x1024', aspectRatio, imageType, entryApi, metadata, onStatus } = input
  const mode = referenceImages.length > 0 ? 'edit' : 'generate'
  const startedAt = Date.now()

  const operation = await startAiOperation({
    apiKeyId,
    kind: 'IMAGE_GENERATION',
    entryPoint: entryApi ?? 'direct',
    inputSummary: {
      promptLength: prompt.length,
      imageType: imageType ?? null,
      aspectRatio: aspectRatio ?? null,
      size,
      referenceImageCount: referenceImages.length,
      referenceMediaTypes: referenceImages.map((image) => image.mediaType),
    },
    requestSnapshot: {
      prompt,
      imageType: imageType ?? null,
      aspectRatio: aspectRatio ?? null,
      size,
      mode,
      referenceImages: referenceImages.map((image, index) => ({
        index,
        mediaType: image.mediaType,
        sizeBytes: Buffer.from(image.data, 'base64').byteLength,
      })),
    },
    expiresAt: getAiOperationExpiryDate(),
  })

  const requestRecord = await prisma.imageGenerationRequest.create({
    data: {
      apiKeyId,
      operationId: operation.id,
      prompt,
      finalPrompt: prompt,
      imageType,
      aspectRatio,
      size,
      metadata: metadata ? (metadata as Prisma.InputJsonValue) : undefined,
      referenceImageCount: referenceImages.length,
      referenceImagesJson: referenceImages.map((image, index) => ({
        index,
        mediaType: image.mediaType,
        sizeBytes: Buffer.from(image.data, 'base64').byteLength,
      })) as Prisma.InputJsonValue,
      requestSnapshotJson: {
        prompt,
        imageType: imageType ?? null,
        aspectRatio: aspectRatio ?? null,
        size,
        mode,
      },
      finalUpstreamApiKind: upstreamApiKindFromMode(mode),
      status: 'STARTED',
      statusMessage: '正在尝试第一线路',
      startedAt: new Date(),
    },
  })

  const emitStatus = async (message: string) => {
    await emitPersistedStatus(requestRecord.id, message)
    if (onStatus) {
      await onStatus(message)
    }
  }

  // --- Smart provider selection ---
  const scoredProviders = await selectProviders()
  const providers = scoredProviders.map(sp => sp.provider)

  if (providers.length === 0) {
    const errorMessage = 'No enabled image providers are configured'
    await prisma.imageGenerationRequest.update({
      where: { id: requestRecord.id },
      data: {
        status: 'FAILED',
        errorMessage,
        statusMessage: errorMessage,
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
      },
    })
    await completeAiOperation({
      operationId: operation.id,
      status: 'FAILED',
      finalPrompt: prompt,
      errorMessage,
      responseSnapshot: {
        stage: 'provider-discovery',
        reason: 'no_enabled_providers',
      },
    }).catch(() => undefined)
    throw new Error(errorMessage)
  }

  const imageFiles = referenceImages.slice(0, 3).map(toImageFile)
  const errors: string[] = []
  const attemptedLines: RouteSummary['attemptedLines'] = []

  console.info('[image.generate] request start', {
    requestId: requestRecord.id,
    mode,
    size,
    aspectRatio: aspectRatio || 'unspecified',
    promptLength: prompt.length,
    referenceImageCount: referenceImages.length,
    providerCount: providers.length,
    providerScores: scoredProviders.map(sp => ({
      name: sp.provider.name,
      score: sp.score.toFixed(3),
    })),
  })

  for (let index = 0; index < providers.length; index += 1) {
    const provider = providers[index]
    const attemptDurationMs = Date.now()

    if (index === 0) {
      await emitStatus('正在尝试第一线路')
    }

    const attemptRequestSnapshot = {
      prompt,
      size,
      aspectRatio: aspectRatio ?? null,
      mode,
      referenceImageCount: referenceImages.length,
      providerName: provider.name,
      providerBaseUrl: provider.baseUrl,
      providerModel: provider.model,
    }

    const operationAttempt = await startAiOperationAttempt({
      operationId: operation.id,
      providerType: 'IMAGE',
      providerId: provider.id,
      providerName: provider.name,
      baseUrl: provider.baseUrl,
      model: provider.model,
      attemptIndex: index + 1,
      upstreamApiKind: upstreamApiKindFromMode(mode),
      requestSnapshot: attemptRequestSnapshot,
    })

    const attempt = await prisma.imageGenerationAttempt.create({
      data: {
        requestId: requestRecord.id,
        operationAttemptId: operationAttempt.id,
        providerId: provider.id,
        baseUrl: provider.baseUrl,
        model: provider.model,
        attemptIndex: index + 1,
        upstreamApiKind: upstreamApiKindFromMode(mode),
        status: 'STARTED',
        requestSnapshotJson: attemptRequestSnapshot as Prisma.InputJsonValue,
      },
    })

    try {
      const attemptResult = await withTimeout(async () => {
        const apiKey = decryptSecret(provider.apiKeyCiphertext)
        const revisedPrompt = prompt
        const extracted = isEvolinkProvider(provider.vendor, provider.baseUrl)
          ? await requestEvolinkImage({
              requestId: requestRecord.id,
              apiKey,
              baseUrl: provider.baseUrl,
              model: provider.model,
              prompt,
              size,
              referenceImages,
            })
          : await (async () => {
              const client = createOpenAIClient(apiKey, provider.baseUrl)
              const response = mode === 'edit'
                ? await client.images.edit(buildImageEditParams({
                    model: provider.model,
                    image: imageFiles,
                    prompt,
                    size,
                  }))
                : await client.images.generate(buildImageGenerateParams({
                    model: provider.model,
                    prompt,
                    size,
                  }))

              if (!response.data || response.data.length === 0) {
                throw new Error('No image data returned from upstream provider')
              }

              const imageData = response.data[0] as any
              return {
                ...(await extractUpstreamImage(imageData)),
                revisedPrompt: imageData.revised_prompt || prompt,
              }
            })()

        const cosKey = buildCosKey(requestRecord.id, extracted.mimeType)
        const uploaded = await uploadBufferToCos({
          buffer: extracted.buffer,
          key: cosKey,
          contentType: extracted.mimeType,
          timeoutMs: PROVIDER_TIMEOUT_MS,
        })

        await prisma.generatedImageAsset.create({
          data: {
            requestId: requestRecord.id,
            operationId: operation.id,
            cosUrl: uploaded.url,
            cosKey: uploaded.key,
            mimeType: uploaded.mimeType,
            bytes: uploaded.bytes,
            upstreamSourceUrl: extracted.returnedKind === 'remote-url' ? 'remote-upstream' : null,
          },
        })

        return {
          uploaded,
          revisedPrompt: 'revisedPrompt' in extracted ? extracted.revisedPrompt : revisedPrompt,
          returnedImageUrlKind: extracted.returnedKind,
        }
      }, PROVIDER_TIMEOUT_MS, `Provider timed out after ${PROVIDER_TIMEOUT_MS}ms`)

      const attemptDuration = Date.now() - attemptDurationMs

      await prisma.imageGenerationAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'SUCCEEDED',
          durationMs: attemptDuration,
          responseSnapshotJson: {
            returnedImageUrlKind: attemptResult.returnedImageUrlKind,
            uploadedUrl: attemptResult.uploaded.url,
            uploadedBytes: attemptResult.uploaded.bytes,
            revisedPrompt: attemptResult.revisedPrompt,
          },
          completedAt: new Date(),
        },
      })

      await completeAiOperationAttempt({
        attemptId: operationAttempt.id,
        status: 'SUCCEEDED',
        responseSnapshot: {
          returnedImageUrlKind: attemptResult.returnedImageUrlKind,
          uploadedUrl: attemptResult.uploaded.url,
          uploadedBytes: attemptResult.uploaded.bytes,
          revisedPrompt: attemptResult.revisedPrompt,
        },
      })

      await prisma.imageGenerationRequest.update({
        where: { id: requestRecord.id },
        data: {
          selectedProviderId: provider.id,
          selectedProviderName: provider.name,
          selectedProviderBaseUrl: provider.baseUrl,
          selectedProviderModel: provider.model,
          attemptCount: index + 1,
          revisedPrompt: attemptResult.revisedPrompt,
          responseSnapshotJson: {
            selectedProviderName: provider.name,
            returnedImageUrlKind: attemptResult.returnedImageUrlKind,
            uploadedUrl: attemptResult.uploaded.url,
          },
          status: 'SUCCEEDED',
          statusMessage: `${lineName(index + 1)}生成成功`,
          durationMs: Date.now() - startedAt,
          completedAt: new Date(),
        },
      })

      await completeAiOperation({
        operationId: operation.id,
        status: 'SUCCEEDED',
        finalPrompt: prompt,
        outputSummary: {
          selectedProviderName: provider.name,
          selectedProviderModel: provider.model,
          attemptCount: index + 1,
          imageUrl: attemptResult.uploaded.url,
        },
        responseSnapshot: {
          revisedPrompt: attemptResult.revisedPrompt,
          returnedImageUrlKind: attemptResult.returnedImageUrlKind,
          uploadedUrl: attemptResult.uploaded.url,
        },
      })

      // Smart routing: mark success and clear cooldown
      await markProviderSuccess(provider.id, attemptDuration)
      await clearCooldown(provider.id)

      attemptedLines.push({
        lineIndex: index + 1,
        lineName: provider.name,
        status: 'succeeded',
      })

      const routeSummary: RouteSummary = {
        selectedLineName: provider.name,
        selectedLineIndex: index + 1,
        switched: index > 0,
        attemptedLines,
        userMessage: index > 0
          ? `第一线路调用失败，已切换到第 ${index + 1} 线路（${provider.name}）并生成成功。`
          : `已通过第一线路（${provider.name}）生成成功。`,
      }

      await emitStatus(`${lineName(index + 1)}生成成功`)

      return {
        requestId: requestRecord.id,
        operationId: operation.id,
        imageUrl: attemptResult.uploaded.url,
        revisedPrompt: attemptResult.revisedPrompt,
        size,
        aspectRatio,
        routeSummary,
      }
    } catch (error) {
      const message = serializeError(error)
      const errorType = classifyError(error)
      const attemptDuration = Date.now() - attemptDurationMs

      errors.push(`${provider.name}: ${message}`)
      attemptedLines.push({
        lineIndex: index + 1,
        lineName: provider.name,
        status: 'failed',
        errorMessage: message,
      })

      await prisma.imageGenerationAttempt.update({
        where: { id: attempt.id },
        data: {
          status: 'FAILED',
          durationMs: attemptDuration,
          errorMessage: message,
          errorType,
          responseSnapshotJson: {
            errorMessage: message,
            errorType,
          },
          completedAt: new Date(),
        },
      })

      await completeAiOperationAttempt({
        attemptId: operationAttempt.id,
        status: 'FAILED',
        errorMessage: message,
        responseSnapshot: {
          errorMessage: message,
          errorType,
        },
      }).catch(() => undefined)

      // Smart routing: mark failure, apply graduated cooldown, check circuit breaker
      await markProviderFailure(provider.id, attemptDuration)
      await applyCooldown(provider.id, errorType, provider.consecutiveFailures)
      const breakerTripped = await checkCircuitBreaker(provider.id)
      if (breakerTripped) {
        console.warn(`[image.generate] Circuit breaker tripped for provider ${provider.name}`)
      }

      if (index < providers.length - 1) {
        await emitStatus(`${lineName(index + 1)}失败，正在切换${lineName(index + 2)}`)
      } else {
        await emitStatus(`${lineName(index + 1)}失败，所有线路都不可用`)
      }
      continue
    }
  }

  const errorMessage = errors.join(' | ') || 'All image providers failed'
  await prisma.imageGenerationRequest.update({
    where: { id: requestRecord.id },
    data: {
      attemptCount: providers.length,
      status: 'FAILED',
      statusMessage: attemptedLines.length > 1 ? '前面线路调用失败，已依次切换后备线路，但全部失败。' : '第一线路调用失败，且当前没有可用后备线路。',
      durationMs: Date.now() - startedAt,
      errorMessage,
      responseSnapshotJson: {
        attemptedLines: attemptedLines as unknown as Prisma.InputJsonValue,
      },
      completedAt: new Date(),
    },
  })

  await completeAiOperation({
    operationId: operation.id,
    status: 'FAILED',
    finalPrompt: prompt,
    errorMessage,
    outputSummary: {
      attemptedLines,
    },
    responseSnapshot: {
      attemptedLines,
    },
  }).catch(() => undefined)

  throw new GenerateImageRouteError(errorMessage, {
    selectedLineName: '',
    selectedLineIndex: 0,
    switched: attemptedLines.length > 1,
    attemptedLines,
    userMessage: attemptedLines.length > 1
      ? '前面线路调用失败，已依次切换后备线路，但全部失败。'
      : '第一线路调用失败，且当前没有可用后备线路。',
  })
}

export async function buildPersistedImageGenerationPayload(params: {
  prompt: string
  originalPrompt: string
  imageType?: string | null
  aspectRatio?: AspectRatio | null
  size: RenderSize
  referenceImages: StoredReferenceImage[]
  metadata?: Record<string, unknown> | null
}): Promise<PersistedImageGenerationPayload> {
  return {
    prompt: params.prompt,
    originalPrompt: params.originalPrompt,
    imageType: params.imageType ?? null,
    aspectRatio: params.aspectRatio ?? null,
    size: params.size,
    referenceImages: params.referenceImages,
    metadata: params.metadata ?? null,
  }
}

export async function createQueuedImageGenerationRequest(params: {
  apiKeyId: string
  prompt: string
  originalPrompt: string
  entryApi?: string
  imageType?: string | null
  aspectRatio?: AspectRatio | null
  size: RenderSize
  referenceImages: StoredReferenceImage[]
  metadata?: Record<string, unknown>
}) {
  const operation = await startAiOperation({
    apiKeyId: params.apiKeyId,
    kind: 'IMAGE_GENERATION',
    entryPoint: params.entryApi ?? 'queued',
    inputSummary: {
      promptLength: params.prompt.length,
      imageType: params.imageType ?? null,
      aspectRatio: params.aspectRatio ?? null,
      size: params.size,
      referenceImageCount: params.referenceImages.length,
      referenceMediaTypes: params.referenceImages.map((image) => image.mimeType),
    },
    requestSnapshot: {
      prompt: params.prompt,
      originalPrompt: params.originalPrompt,
      imageType: params.imageType ?? null,
      aspectRatio: params.aspectRatio ?? null,
      size: params.size,
      referenceImages: params.referenceImages.map((image, index) => ({
        index,
        url: image.url,
        mimeType: image.mimeType,
        sizeBytes: image.bytes,
      })),
    },
    expiresAt: getAiOperationExpiryDate(),
  })

  const requestPayload = await buildPersistedImageGenerationPayload({
    prompt: params.prompt,
    originalPrompt: params.originalPrompt,
    imageType: params.imageType ?? null,
    aspectRatio: params.aspectRatio ?? null,
    size: params.size,
    referenceImages: params.referenceImages,
    metadata: params.metadata,
  })

  const requestRecord = await prisma.imageGenerationRequest.create({
    data: {
      apiKeyId: params.apiKeyId,
      operationId: operation.id,
      prompt: params.originalPrompt,
      finalPrompt: params.prompt,
      imageType: params.imageType ?? null,
      aspectRatio: params.aspectRatio ?? null,
      size: params.size,
      metadata: params.metadata ? (params.metadata as Prisma.InputJsonValue) : undefined,
      referenceImageCount: params.referenceImages.length,
      referenceImagesJson: params.referenceImages as unknown as Prisma.InputJsonValue,
      requestPayloadJson: requestPayload as unknown as Prisma.InputJsonValue,
      requestSnapshotJson: requestPayload as unknown as Prisma.InputJsonValue,
      finalUpstreamApiKind: upstreamApiKindFromMode(params.referenceImages.length > 0 ? 'edit' : 'generate'),
      status: 'QUEUED',
      statusMessage: '任务已提交，等待 worker 处理',
      queuedAt: new Date(),
    },
  })

  return {
    requestId: requestRecord.id,
    operationId: operation.id,
    status: requestRecord.status,
    statusMessage: requestRecord.statusMessage || '任务已提交，等待 worker 处理',
  }
}

export async function executeQueuedImageGeneration(requestId: string) {
  const request = await prisma.imageGenerationRequest.findUnique({
    where: { id: requestId },
    include: {
      assets: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!request) {
    throw new Error(`Image generation request not found: ${requestId}`)
  }

  if (request.status === 'SUCCEEDED' || request.status === 'FAILED') {
    return request
  }

  const payload = request.requestPayloadJson as PersistedImageGenerationPayload | null
  if (!payload) {
    throw new Error('Queued image generation request is missing requestPayloadJson')
  }

  await prisma.imageGenerationRequest.update({
    where: { id: request.id },
    data: {
      status: 'PROCESSING',
      statusMessage: '正在尝试第一线路',
      startedAt: request.startedAt ?? new Date(),
    },
  })

  const referenceImages = await Promise.all((payload.referenceImages || []).slice(0, 3).map(async (image) => {
    const response = await fetch(image.url)
    if (!response.ok) {
      throw new Error(`Failed to load saved reference image: ${response.status}`)
    }
    const arrayBuffer = await response.arrayBuffer()
    return {
      data: Buffer.from(arrayBuffer).toString('base64'),
      mediaType: response.headers.get('content-type') || image.mimeType || 'image/jpeg',
    }
  }))

  try {
    return await createImageGenerationRequest({
      apiKeyId: request.apiKeyId,
      prompt: payload.prompt,
      referenceImages,
      size: payload.size,
      aspectRatio: payload.aspectRatio ?? undefined,
      imageType: payload.imageType ?? undefined,
      metadata: payload.metadata ?? undefined,
      onStatus: async (message) => {
        await emitPersistedStatus(request.id, message)
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate image'
    await prisma.imageGenerationRequest.update({
      where: { id: request.id },
      data: {
        status: 'FAILED',
        errorMessage: message,
        statusMessage: message,
        completedAt: new Date(),
      },
    }).catch(() => undefined)

    if (request.operationId) {
      await completeAiOperation({
        operationId: request.operationId,
        status: 'FAILED',
        finalPrompt: payload.prompt,
        errorMessage: message,
      }).catch(() => undefined)
    }

    throw error
  }
}
