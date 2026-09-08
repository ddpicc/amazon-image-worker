import OpenAI from 'openai'
import { decryptSecret } from './crypto'
import { getProvider } from './providers/provider-service'
import type { RenderSize } from './image-options'
import { isAgnesImageModel } from './image-models'

const PROVIDER_TIMEOUT_MS = 240_000

function getProviderBaseUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')

  try {
    const url = new URL(normalized)
    const pathname = url.pathname.replace(/\/+$/, '')
    if (!pathname || pathname === '/') {
      url.pathname = '/v1'
    }
    return url.toString().replace(/\/+$/, '')
  } catch {
    return normalized
  }
}

function createOpenAIClient(apiKey: string, baseURL: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL,
    timeout: PROVIDER_TIMEOUT_MS,
    maxRetries: 0,
  })
}

function buildImageGenerateParams(params: { model: string; prompt: string; size: RenderSize }) {
  return {
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size: params.size,
    quality: 'medium',
  } as any
}

function buildAgnesImageGenerateParams(params: { model: string; prompt: string; size: RenderSize }) {
  return {
    model: params.model,
    prompt: params.prompt,
    size: params.size,
    extra_body: {
      response_format: 'url',
    },
  } as any
}

function buildAgnesImageEditParams(params: { model: string; imageUrls: string[]; prompt: string; size: RenderSize }) {
  return {
    model: params.model,
    prompt: params.prompt,
    size: params.size,
    extra_body: {
      image: params.imageUrls,
      response_format: 'url',
    },
  } as any
}

function buildImageEditParams(params: { model: string; image: File[]; prompt: string; size: RenderSize }) {
  return {
    model: params.model,
    image: params.image,
    prompt: params.prompt,
    n: 1,
    size: params.size,
  } as any
}

function getExtensionFromMediaType(mediaType: string): string {
  if (mediaType === 'image/png') return 'png'
  if (mediaType === 'image/webp') return 'webp'
  if (mediaType === 'image/gif') return 'gif'
  if (mediaType === 'image/jpeg') return 'jpg'
  return 'bin'
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

interface ImageDimensions {
  width: number
  height: number
}

function readImageDimensions(buffer: Buffer): ImageDimensions | null {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return {
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
    }
  }

  if (buffer.length >= 10 && (buffer.subarray(0, 6).toString('ascii') === 'GIF87a' || buffer.subarray(0, 6).toString('ascii') === 'GIF89a')) {
    return {
      width: buffer.readUInt16LE(6),
      height: buffer.readUInt16LE(8),
    }
  }

  if (buffer.length >= 30 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    const chunkType = buffer.subarray(12, 16).toString('ascii')

    if (chunkType === 'VP8X') {
      return {
        width: 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16),
        height: 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16),
      }
    }

    if (chunkType === 'VP8 ' && buffer.length >= 30) {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      }
    }

    if (chunkType === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
      const bits = buffer[21] | (buffer[22] << 8) | (buffer[23] << 16) | (buffer[24] << 24)
      return {
        width: 1 + (bits & 0x3fff),
        height: 1 + ((bits >> 14) & 0x3fff),
      }
    }
  }

  if (buffer.length >= 26 && buffer.subarray(0, 2).toString('ascii') === 'BM') {
    const width = buffer.readInt32LE(18)
    const height = buffer.readInt32LE(22)
    if (width > 0 && height !== 0) {
      return { width, height: Math.abs(height) }
    }
  }

  if (buffer.length >= 10 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2
    while (offset + 3 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1
        continue
      }

      while (offset < buffer.length && buffer[offset] === 0xff) offset += 1
      if (offset >= buffer.length) break

      const marker = buffer[offset]
      offset += 1
      if (marker === 0xd9 || marker === 0xda) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 1 >= buffer.length) break

      const segmentLength = buffer.readUInt16BE(offset)
      if (segmentLength < 2 || offset + segmentLength > buffer.length) break

      const isStartOfFrame = (marker >= 0xc0 && marker <= 0xc3)
        || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb)
        || (marker >= 0xcd && marker <= 0xcf)
      if (isStartOfFrame && offset + 7 < buffer.length) {
        return {
          height: buffer.readUInt16BE(offset + 3),
          width: buffer.readUInt16BE(offset + 5),
        }
      }

      offset += segmentLength
    }
  }

  return null
}

function getActualImageTier(buffer: Buffer): { width: number | null; height: number | null; tier: '1K' | '2K' | null } {
  const dimensions = readImageDimensions(buffer)
  if (!dimensions) {
    return { width: null, height: null, tier: null }
  }

  return {
    width: dimensions.width,
    height: dimensions.height,
    tier: dimensions.width * dimensions.height > 2560 * 1440 ? '2K' : '1K',
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

async function extractUpstreamImage(imageData: any): Promise<{ buffer: Buffer; mimeType: string; returnedKind: 'data-url' | 'remote-url' | 'b64-json'; imageUrl: string | null }> {
  const rawImageUrl = imageData?.url || ''
  const b64Json = imageData?.b64_json || ''

  if (rawImageUrl.startsWith('data:')) {
    const parsed = parseDataUrl(rawImageUrl)
    return { ...parsed, returnedKind: 'data-url', imageUrl: null }
  }

  if (rawImageUrl && b64Json && isBareIpUrl(rawImageUrl)) {
    return {
      ...parseBase64Payload(b64Json),
      returnedKind: 'b64-json',
      imageUrl: null,
    }
  }

  if (rawImageUrl) {
    const downloaded = await downloadRemoteImage(rawImageUrl)
    return { ...downloaded, returnedKind: 'remote-url', imageUrl: rawImageUrl }
  }

  if (b64Json) {
    return {
      ...parseBase64Payload(b64Json),
      returnedKind: 'b64-json',
      imageUrl: null,
    }
  }

  throw new Error('Upstream image response did not include url or b64_json')
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export interface DirectProviderTestResult {
  provider: {
    id: string
    name: string
    vendor: string
    baseUrl: string
    model: string
    enabled: boolean
    cooldownUntil: Date | null
    circuitBreakerTrippedAt: Date | null
    circuitBreakerTripReason: string | null
  }
  mode: 'generate' | 'edit'
  prompt: string
  size: RenderSize
  referenceImageUrls: string[]
  durationMs: number
  revisedPrompt: string
  returnedImageUrlKind: 'data-url' | 'remote-url' | 'b64-json'
  upstreamImageUrl: string | null
  mimeType: string
  bytes: number
  actualImageWidth: number | null
  actualImageHeight: number | null
  actualImageTier: '1K' | '2K' | null
  imageBase64: string
}

export async function testImageProviderDirect(params: {
  providerId: string
  prompt: string
  size: RenderSize
  imageUrls?: string[]
}): Promise<DirectProviderTestResult> {
  const provider = await getProvider(params.providerId)
  if (!provider) {
    throw new Error('Provider not found')
  }

  const imageUrls = (params.imageUrls || []).slice(0, 16)
  const mode = imageUrls.length > 0 ? 'edit' as const : 'generate' as const
  const startedAt = Date.now()

  try {
    const apiKey = decryptSecret(provider.apiKeyCiphertext)
    const client = createOpenAIClient(apiKey, provider.baseUrl)

    const response = mode === 'edit'
      ? await (async () => {
          if (isAgnesImageModel(provider.model)) {
            return client.images.generate(buildAgnesImageEditParams({
              model: provider.model,
              imageUrls,
              prompt: params.prompt,
              size: params.size,
            }))
          }

          const imageFiles = await Promise.all(imageUrls.map(async (url, index) => {
            const res = await fetch(url)
            if (!res.ok) {
              throw new Error(`Failed to download reference image: ${res.status}`)
            }
            const arrayBuffer = await res.arrayBuffer()
            const contentType = res.headers.get('content-type') || 'image/png'
            const ext = getExtensionFromMediaType(contentType)
            return new File([arrayBuffer], `reference-${index}.${ext}`, { type: contentType })
          }))
          return client.images.edit(buildImageEditParams({
            model: provider.model,
            image: imageFiles,
            prompt: params.prompt,
            size: params.size,
          }))
        })()
      : isAgnesImageModel(provider.model)
        ? await client.images.generate(buildAgnesImageGenerateParams({
            model: provider.model,
            prompt: params.prompt,
            size: params.size,
          }))
        : await client.images.generate(buildImageGenerateParams({
            model: provider.model,
            prompt: params.prompt,
            size: params.size,
          }))

    const imageData = getCompatibleImageData(response)
    if (!imageData) {
      throw new Error(`${provider.name}: No image data returned from upstream provider. Raw keys: ${Object.keys(response || {}).join(',')}`)
    }

    const extracted = await extractUpstreamImage(imageData)
    const actualImage = getActualImageTier(extracted.buffer)
    const revisedPrompt = imageData.revised_prompt || imageData.revisedPrompt || params.prompt

    return {
      provider: {
        id: provider.id,
        name: provider.name,
        vendor: provider.vendor,
        baseUrl: getProviderBaseUrl(provider.baseUrl),
        model: provider.model,
        enabled: provider.enabled,
        cooldownUntil: provider.cooldownUntil,
        circuitBreakerTrippedAt: provider.circuitBreakerTrippedAt,
        circuitBreakerTripReason: provider.circuitBreakerTripReason,
      },
      mode,
      prompt: params.prompt,
      size: params.size,
      referenceImageUrls: imageUrls,
      durationMs: Date.now() - startedAt,
      revisedPrompt,
      returnedImageUrlKind: extracted.returnedKind,
      upstreamImageUrl: extracted.imageUrl,
      mimeType: extracted.mimeType,
      bytes: extracted.buffer.byteLength,
      actualImageWidth: actualImage.width,
      actualImageHeight: actualImage.height,
      actualImageTier: actualImage.tier,
      imageBase64: extracted.buffer.toString('base64'),
    }
  } catch (error) {
    throw new Error(serializeError(error))
  }
}
