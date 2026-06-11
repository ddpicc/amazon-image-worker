import OpenAI from 'openai'
import { decryptSecret } from './crypto'
import { getProvider } from './providers/provider-service'
import type { RenderSize } from './image-options'

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
  })
}

function buildImageGenerateParams(params: { model: string; prompt: string; size: RenderSize }) {
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
  }
  prompt: string
  size: RenderSize
  durationMs: number
  revisedPrompt: string
  returnedImageUrlKind: 'data-url' | 'remote-url' | 'b64-json'
  upstreamImageUrl: string | null
  mimeType: string
  bytes: number
  imageBase64: string
}

export async function testImageProviderDirect(params: {
  providerId: string
  prompt: string
  size: RenderSize
}): Promise<DirectProviderTestResult> {
  const provider = await getProvider(params.providerId)
  if (!provider) {
    throw new Error('Provider not found')
  }

  if (!provider.enabled) {
    throw new Error('Provider is disabled')
  }

  const startedAt = Date.now()

  try {
    const apiKey = decryptSecret(provider.apiKeyCiphertext)
    const client = createOpenAIClient(apiKey, provider.baseUrl)
    const response = await client.images.generate(buildImageGenerateParams({
      model: provider.model,
      prompt: params.prompt,
      size: params.size,
    }))

    const imageData = getCompatibleImageData(response)
    if (!imageData) {
      throw new Error(`${provider.name}: No image data returned from upstream provider. Raw keys: ${Object.keys(response || {}).join(',')}`)
    }

    const extracted = await extractUpstreamImage(imageData)
    const revisedPrompt = imageData.revised_prompt || imageData.revisedPrompt || params.prompt

    return {
      provider: {
        id: provider.id,
        name: provider.name,
        vendor: provider.vendor,
        baseUrl: getProviderBaseUrl(provider.baseUrl),
        model: provider.model,
        enabled: provider.enabled,
      },
      prompt: params.prompt,
      size: params.size,
      durationMs: Date.now() - startedAt,
      revisedPrompt,
      returnedImageUrlKind: extracted.returnedKind,
      upstreamImageUrl: extracted.imageUrl,
      mimeType: extracted.mimeType,
      bytes: extracted.buffer.byteLength,
      imageBase64: extracted.buffer.toString('base64'),
    }
  } catch (error) {
    throw new Error(serializeError(error))
  }
}
