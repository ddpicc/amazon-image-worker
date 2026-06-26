import crypto from 'crypto'
import dns from 'dns/promises'
import net from 'net'
import { uploadBufferToObjectStorage } from '@/lib/object-storage'
import type { StoredReferenceImage } from '@/lib/amazon-workflow'
import { logger } from '@/lib/logger'

export const MAX_REFERENCE_IMAGE_BYTES = 15 * 1024 * 1024
const REMOTE_REFERENCE_TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 5

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export class RemoteReferenceImageError extends Error {
  code: string

  constructor(code: string) {
    super(code)
    this.name = 'RemoteReferenceImageError'
    this.code = code
  }
}

function isPrivateIp(address: string) {
  const ipVersion = net.isIP(address)
  if (ipVersion === 4) {
    const parts = address.split('.').map(Number)
    const [a, b] = parts
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a >= 224) return true
    return false
  }

  if (ipVersion === 6) {
    const normalized = address.toLowerCase()
    if (normalized === '::1' || normalized === '::') return true
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
    if (normalized.startsWith('fe80:')) return true
    if (normalized.startsWith('ff')) return true
    if (normalized.startsWith('::ffff:')) {
      return isPrivateIp(normalized.slice('::ffff:'.length))
    }
    return false
  }

  return true
}

function assertAllowedProtocol(url: URL) {
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new RemoteReferenceImageError('reference_image_url_protocol_not_allowed')
  }
}

async function assertPublicHostname(url: URL) {
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new RemoteReferenceImageError('reference_image_private_host_not_allowed')
  }

  const records = await dns.lookup(hostname, { all: true, verbatim: true })
  if (records.length === 0) {
    throw new RemoteReferenceImageError('reference_image_host_not_resolved')
  }
  const privateRecord = records.find((record) => isPrivateIp(record.address))
  if (privateRecord) {
    throw new RemoteReferenceImageError('reference_image_private_ip_not_allowed')
  }
}

function normalizeContentType(value: string | null) {
  return value?.split(';')[0]?.trim().toLowerCase() || ''
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  return 'jpg'
}

function buildReferenceObjectKey(mimeType: string) {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(now.getUTCDate()).padStart(2, '0')
  const env = process.env.NODE_ENV || 'development'
  return `reference-images/${env}/${yyyy}/${mm}/${dd}/${crypto.randomUUID()}.${extensionForMimeType(mimeType)}`
}

async function readResponseBodyWithLimit(response: Response) {
  if (!response.body) {
    throw new RemoteReferenceImageError('reference_image_empty_body')
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    totalBytes += value.byteLength
    if (totalBytes > MAX_REFERENCE_IMAGE_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw new RemoteReferenceImageError('reference_image_too_large')
    }
    chunks.push(value)
  }

  return Buffer.concat(chunks, totalBytes)
}

async function fetchRemoteImage(url: URL, redirectCount = 0): Promise<{
  finalUrl: string
  mimeType: string
  buffer: Buffer
}> {
  if (redirectCount > MAX_REDIRECTS) {
    throw new RemoteReferenceImageError('reference_image_too_many_redirects')
  }

  assertAllowedProtocol(url)
  await assertPublicHostname(url)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REMOTE_REFERENCE_TIMEOUT_MS)
  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'image/jpeg,image/png,image/webp',
        'User-Agent': 'amazon-image-worker/1.0 reference-fetcher',
      },
    })

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) {
        throw new RemoteReferenceImageError('reference_image_redirect_without_location')
      }
      const nextUrl = new URL(location, url)
      return fetchRemoteImage(nextUrl, redirectCount + 1)
    }

    if (!response.ok) {
      throw new RemoteReferenceImageError('reference_image_fetch_failed')
    }

    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > MAX_REFERENCE_IMAGE_BYTES) {
      throw new RemoteReferenceImageError('reference_image_too_large')
    }

    const mimeType = normalizeContentType(response.headers.get('content-type'))
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new RemoteReferenceImageError('reference_image_content_type_not_allowed')
    }

    return {
      finalUrl: url.toString(),
      mimeType,
      buffer: await readResponseBodyWithLimit(response),
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function loadStoredReferenceImage(image: StoredReferenceImage): Promise<{
  data: string
  mediaType: string
}> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REMOTE_REFERENCE_TIMEOUT_MS)
  try {
    const response = await fetch(image.url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'image/jpeg,image/png,image/webp',
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to load saved reference image: ${response.status}`)
    }

    const contentLength = Number(response.headers.get('content-length') || 0)
    if (contentLength > MAX_REFERENCE_IMAGE_BYTES) {
      throw new Error('Saved reference image exceeds maximum size')
    }

    const responseMimeType = normalizeContentType(response.headers.get('content-type'))
    const mimeType = responseMimeType || image.mimeType || 'image/jpeg'
    if (!ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
      throw new Error('Saved reference image has unsupported content type')
    }

    const buffer = await readResponseBodyWithLimit(response)
    return {
      data: buffer.toString('base64'),
      mediaType: mimeType,
    }
  } finally {
    clearTimeout(timeout)
  }
}

export async function storeRemoteReferenceImages(urls: string[]): Promise<StoredReferenceImage[]> {
  const stored: StoredReferenceImage[] = []

  for (let index = 0; index < urls.length; index += 1) {
    const sourceUrl = urls[index]
    const startedAt = Date.now()
    let parsed: URL
    try {
      parsed = new URL(sourceUrl)
    } catch {
      throw new RemoteReferenceImageError('reference_image_url_invalid')
    }

    let downloaded: Awaited<ReturnType<typeof fetchRemoteImage>>
    try {
      downloaded = await fetchRemoteImage(parsed)
    } catch (error) {
      const code = error instanceof RemoteReferenceImageError ? error.code : 'reference_image_fetch_error'
      logger.warn('reference_image.rejected', {
        index,
        sourceUrl,
        code,
        error,
        durationMs: Date.now() - startedAt,
      })
      throw new RemoteReferenceImageError(code)
    }
    const uploaded = await uploadBufferToObjectStorage({
      buffer: downloaded.buffer,
      key: buildReferenceObjectKey(downloaded.mimeType),
      contentType: downloaded.mimeType,
      timeoutMs: REMOTE_REFERENCE_TIMEOUT_MS,
    })

    logger.info('reference_image.stored', {
      index,
      sourceUrl,
      finalUrl: downloaded.finalUrl,
      storageKey: uploaded.key,
      bytes: uploaded.bytes,
      mimeType: uploaded.mimeType,
      durationMs: Date.now() - startedAt,
    })

    stored.push({
      url: uploaded.url,
      key: uploaded.key,
      mimeType: uploaded.mimeType,
      bytes: uploaded.bytes,
      name: `reference-${index}`,
    })
  }

  return stored
}
