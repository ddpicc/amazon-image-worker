import OpenAI from 'openai'
import { Prisma } from '@prisma/client'
import { decryptSecret } from './crypto'
import { StoredReferenceImage } from './amazon-workflow'
import { AspectRatio, RenderSize } from './image-options'
import { completeAiOperation, completeAiOperationAttempt, getAiOperationExpiryDate, startAiOperation, startAiOperationAttempt } from './ai-operations'
import { RouteSummary, PersistedImageGenerationPayload } from './image-generation'
import { selectProviders, markProviderSuccess, markProviderFailure, acquireProviderSlot, releaseProviderSlot } from './providers/provider-service'
import { classifyError } from './providers/error-classifier'
import { applyCooldown, clearCooldown } from './providers/cooldown'
import { checkCircuitBreaker } from './providers/circuit-breaker'
import { normalizeImageModel } from './image-models'
import { prisma } from './db/prisma'
import { getObjectStorageBackend, uploadBufferToObjectStorage } from './object-storage'
import { dispatchImageTaskCallback } from './image-task-callback'
import { loadStoredReferenceImage } from './remote-reference-images'

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
  requestId?: string
  operationId?: string
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

export class ProviderCapacityRequeueError extends Error {
  constructor(message = 'All providers are currently at capacity') {
    super(message)
    this.name = 'ProviderCapacityRequeueError'
  }
}

const PROVIDER_TIMEOUT_MS = 240_000
const CAPACITY_REQUEUE_LIMIT = 30
const CAPACITY_REQUEUE_MAX_WAIT_MS = 7 * 60 * 1000

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

function isAgnesImageModel(model: string): boolean {
  return normalizeImageModel(model) === 'agnes-image-2.1-flash'
}

function toDataUri(referenceImage: { data: string; mediaType: string }): string {
  return `data:${referenceImage.mediaType || 'image/jpeg'};base64,${referenceImage.data}`
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
  } as any
}

function buildAgnesImageEditParams(params: {
  model: string
  image: string[]
  prompt: string
  size: RenderSize
}) {
  return {
    model: params.model,
    prompt: params.prompt,
    size: params.size,
    extra_body: {
      image: params.image,
      response_format: 'url',
    },
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
    // response_format removed — not supported by agnes-image-2.1-flash (LiteLLM).
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

function getCompatibleImageData(response: any): any {
  if (Array.isArray(response?.data) && response.data.length > 0) {
    return response.data[0]
  }

  if (Array.isArray(response?.images) && response.images.length > 0) {
    return response.images[0]
  }

  if (Array.isArray(response?.output) && response.output.length > 0) {
    return response.output[0]
  }

  if (response?.result && typeof response.result === 'object') {
    return response.result
  }

  return null
}

function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return AbortSignal.timeout(timeoutMs)
  }
  return undefined
}

function isBareIpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname)
  } catch {
    return false
  }
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

  if (rawImageUrl && b64Json && isBareIpUrl(rawImageUrl)) {
    return {
      ...parseBase64Payload(b64Json),
      returnedKind: 'b64-json',
    }
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

async function dispatchStoredTaskCallback(requestId: string) {
  const request = await prisma.imageGenerationRequest.findUnique({
    where: { id: requestId },
    include: {
      assets: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!request?.callbackUrl) {
    return
  }

  await dispatchImageTaskCallback({
    callbackUrl: request.callbackUrl,
    task: request,
  }).catch(() => undefined)
}

export async function createImageGenerationRequest(input: GenerateImageInput): Promise<GenerateImageOutput> {
  const { apiKeyId, prompt, referenceImages, size = '1024x1024', aspectRatio, imageType, entryApi, metadata, onStatus } = input
  const mode = referenceImages.length > 0 ? 'edit' : 'generate'

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

  return runImageGenerationForExistingRequest({
    requestId: requestRecord.id,
    operationId: operation.id,
    apiKeyId,
    model: null,
    prompt,
    referenceImages,
    size,
    aspectRatio,
    imageType,
    metadata,
    onStatus,
  })
}

async function runImageGenerationForExistingRequest(params: {
  requestId: string
  operationId: string
  apiKeyId: string
  model?: string | null
  prompt: string
  referenceImages: Array<{ data: string; mediaType: string }>
  size: RenderSize
  aspectRatio?: AspectRatio
  imageType?: string
  metadata?: Record<string, unknown>
  onStatus?: (message: string) => Promise<void> | void
}): Promise<GenerateImageOutput> {
  const { requestId, operationId, apiKeyId, model, prompt, referenceImages, size, aspectRatio, imageType, onStatus } = params
  const mode = referenceImages.length > 0 ? 'edit' : 'generate'
  const startedAt = Date.now()

  const emitStatus = async (message: string) => {
    await emitPersistedStatus(requestId, message)
    if (onStatus) {
      await onStatus(message)
    }
  }

  const scoredProviders = await selectProviders(model ?? undefined)
  const providers = scoredProviders.map(sp => sp.provider)

  if (providers.length === 0) {
    const errorMessage = 'No enabled image providers are configured'
    await prisma.imageGenerationRequest.update({
      where: { id: requestId },
      data: {
        status: 'FAILED',
        errorMessage,
        statusMessage: errorMessage,
        durationMs: Date.now() - startedAt,
        completedAt: new Date(),
      },
    })
    await completeAiOperation({
      operationId: operationId,
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

  const imageFiles = referenceImages.slice(0, 16).map(toImageFile)
  const agnesEditImages = referenceImages.slice(0, 16).map(toDataUri)
  const errors: string[] = []
  const attemptedLines: RouteSummary['attemptedLines'] = []
  let capacityBlocked = false

  console.info('[image.generate] request start', {
    requestId: requestId,
    mode,
    size,
    aspectRatio: aspectRatio || 'unspecified',
    promptLength: prompt.length,
    referenceImageCount: referenceImages.length,
    storageBackend: getObjectStorageBackend(),
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

    // Acquire provider concurrency slot; skip if at capacity
    if (!acquireProviderSlot(provider.id, provider.maxConcurrent)) {
      capacityBlocked = true
      console.info('[image.generate] provider at capacity, skipping', {
        requestId,
        providerName: provider.name,
        providerId: provider.id,
        inflight: provider.maxConcurrent,
      })
      continue
    }

    const operationAttempt = await startAiOperationAttempt({
      operationId: operationId,
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
        requestId: requestId,
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
        const phaseStartedAt = Date.now()
        const apiKey = decryptSecret(provider.apiKeyCiphertext)
        const decryptMs = Date.now() - phaseStartedAt

        const revisedPrompt = prompt
        const upstreamStartedAt = Date.now()
        const extracted = await (async () => {
          const client = createOpenAIClient(apiKey, provider.baseUrl)
          const response = mode === 'edit'
            ? isAgnesImageModel(provider.model)
              ? await client.images.generate(buildAgnesImageEditParams({
                  model: provider.model,
                  image: agnesEditImages,
                  prompt,
                  size,
                }))
              : await client.images.edit(buildImageEditParams({
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

          const imageData = getCompatibleImageData(response)
          if (!imageData) {
            throw new Error(`${provider.name}: No image data returned from upstream provider. Raw keys: ${Object.keys(response || {}).join(',')}`)
          }

          try {
            return {
              ...(await extractUpstreamImage(imageData)),
              revisedPrompt: imageData.revised_prompt || imageData.revisedPrompt || prompt,
            }
          } catch (extractError) {
            const extractMessage = extractError instanceof Error ? extractError.message : String(extractError)
            throw new Error(`${provider.name}: ${extractMessage}. imageData keys: ${Object.keys(imageData || {}).join(',')}`)
          }
        })()
        const upstreamMs = Date.now() - upstreamStartedAt

        const cosKey = buildCosKey(requestId, extracted.mimeType)
        const cosUploadStartedAt = Date.now()
        const uploaded = await uploadBufferToObjectStorage({
          buffer: extracted.buffer,
          key: cosKey,
          contentType: extracted.mimeType,
          timeoutMs: PROVIDER_TIMEOUT_MS,
        })
        const cosUploadMs = Date.now() - cosUploadStartedAt

        const assetPersistStartedAt = Date.now()
        await prisma.generatedImageAsset.create({
          data: {
            requestId: requestId,
            operationId: operationId,
            cosUrl: uploaded.url,
            cosKey: uploaded.key,
            mimeType: uploaded.mimeType,
            bytes: uploaded.bytes,
            upstreamSourceUrl: extracted.returnedKind === 'remote-url' ? 'remote-upstream' : null,
          },
        })
        const assetPersistMs = Date.now() - assetPersistStartedAt

        return {
          uploaded,
          revisedPrompt: 'revisedPrompt' in extracted ? extracted.revisedPrompt : revisedPrompt,
          returnedImageUrlKind: extracted.returnedKind,
          timing: {
            decryptMs,
            upstreamMs,
            cosUploadMs,
            assetPersistMs,
            totalInnerMs: Date.now() - phaseStartedAt,
          },
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
            storageBackend: attemptResult.uploaded.backend,
            revisedPrompt: attemptResult.revisedPrompt,
            timing: attemptResult.timing,
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
          storageBackend: attemptResult.uploaded.backend,
          revisedPrompt: attemptResult.revisedPrompt,
          timing: attemptResult.timing,
        },
      })

      await prisma.imageGenerationRequest.update({
        where: { id: requestId },
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
            storageBackend: attemptResult.uploaded.backend,
            timing: {
              ...attemptResult.timing,
              requestTotalMs: Date.now() - startedAt,
              attemptTotalMs: attemptDuration,
            },
          },
          status: 'SUCCEEDED',
          statusMessage: `${lineName(index + 1)}生成成功`,
          durationMs: Date.now() - startedAt,
          completedAt: new Date(),
        },
      })

      await completeAiOperation({
        operationId: operationId,
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
          storageBackend: attemptResult.uploaded.backend,
          timing: {
            ...attemptResult.timing,
            requestTotalMs: Date.now() - startedAt,
            attemptTotalMs: attemptDuration,
          },
        },
      })

      // Smart routing: mark success and clear cooldown
      await markProviderSuccess(provider.id, attemptDuration)
      await clearCooldown(provider.id)
      releaseProviderSlot(provider.id)

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
      await dispatchStoredTaskCallback(requestId)

      return {
        requestId: requestId,
        operationId: operationId,
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
            timing: {
              attemptTotalMs: attemptDuration,
            },
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
          timing: {
            attemptTotalMs: attemptDuration,
          },
        },
      }).catch(() => undefined)

      // Smart routing: mark failure, apply graduated cooldown, check circuit breaker
      await markProviderFailure(provider.id, attemptDuration)
      await applyCooldown(provider.id, errorType, provider.consecutiveFailures)
      releaseProviderSlot(provider.id)
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

  if (capacityBlocked) {
    throw new ProviderCapacityRequeueError()
  }

  const errorMessage = errors.join(' | ') || 'All image providers failed'
  await prisma.imageGenerationRequest.update({
    where: { id: requestId },
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
    operationId: operationId,
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
  model?: string | null
  prompt: string
  originalPrompt: string
  imageType?: string | null
  aspectRatio?: AspectRatio | null
  size: RenderSize
  referenceImages: StoredReferenceImage[]
  metadata?: Record<string, unknown> | null
  callbackUrl?: string | null
}): Promise<PersistedImageGenerationPayload> {
  return {
    model: params.model ?? null,
    prompt: params.prompt,
    originalPrompt: params.originalPrompt,
    imageType: params.imageType ?? null,
    aspectRatio: params.aspectRatio ?? null,
    size: params.size,
    referenceImages: params.referenceImages,
    metadata: params.metadata ?? null,
    callbackUrl: params.callbackUrl ?? null,
  }
}

export async function createQueuedImageGenerationRequest(params: {
  apiKeyId: string
  model?: string | null
  prompt: string
  originalPrompt: string
  entryApi?: string
  imageType?: string | null
  aspectRatio?: AspectRatio | null
  size: RenderSize
  referenceImages: StoredReferenceImage[]
  metadata?: Record<string, unknown>
  callbackUrl?: string | null
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
    model: params.model ?? null,
    prompt: params.prompt,
    originalPrompt: params.originalPrompt,
    imageType: params.imageType ?? null,
    aspectRatio: params.aspectRatio ?? null,
    size: params.size,
    referenceImages: params.referenceImages,
    metadata: params.metadata,
    callbackUrl: params.callbackUrl ?? null,
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
      callbackUrl: params.callbackUrl ?? null,
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

  const referenceImages = await Promise.all(
    (payload.referenceImages || []).slice(0, 16).map(loadStoredReferenceImage),
  )

  try {
    if (!request.operationId) {
      throw new Error('Queued image generation request is missing operationId')
    }

    return await runImageGenerationForExistingRequest({
      requestId: request.id,
      operationId: request.operationId,
      apiKeyId: request.apiKeyId,
      model: payload.model ?? null,
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
    if (error instanceof ProviderCapacityRequeueError) {
      const now = Date.now()
      const currentRequeueCount = (request as { capacityRequeueCount?: number | null }).capacityRequeueCount ?? 0
      const nextRequeueCount = currentRequeueCount + 1
      const waitStartedAt = request.queuedAt ?? request.createdAt
      const totalWaitMs = now - waitStartedAt.getTime()

      if (nextRequeueCount > CAPACITY_REQUEUE_LIMIT || totalWaitMs > CAPACITY_REQUEUE_MAX_WAIT_MS) {
        const timeoutReason = nextRequeueCount > CAPACITY_REQUEUE_LIMIT
          ? `Provider remained at capacity after ${currentRequeueCount} requeues`
          : `Provider remained at capacity for ${Math.ceil(totalWaitMs / 1000)} seconds`

        await prisma.imageGenerationRequest.update({
          where: { id: request.id },
          data: {
            status: 'FAILED',
            errorMessage: timeoutReason,
            statusMessage: timeoutReason,
            completedAt: new Date(),
          },
        }).catch(() => undefined)

        if (request.operationId) {
          await completeAiOperation({
            operationId: request.operationId,
            status: 'FAILED',
            finalPrompt: payload.prompt,
            errorMessage: timeoutReason,
          }).catch(() => undefined)
        }

        await dispatchStoredTaskCallback(request.id)
        throw new Error(timeoutReason)
      }

      await prisma.imageGenerationRequest.update({
        where: { id: request.id },
        data: {
          status: 'QUEUED',
          statusMessage: `Provider 满载，10 秒后自动重试（${nextRequeueCount}/${CAPACITY_REQUEUE_LIMIT}）`,
          capacityRequeueCount: {
            increment: 1,
          },
          errorMessage: null,
          completedAt: null,
        } as any,
      }).catch(() => undefined)

      throw error
    }

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

    await dispatchStoredTaskCallback(request.id)

    throw error
  }
}
