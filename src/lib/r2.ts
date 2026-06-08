import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'

const R2_UPLOAD_TIMEOUT_MS = 180_000

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} environment variable is not set`)
  }
  return value
}

let r2Client: S3Client | null = null

function getR2Client(): S3Client {
  if (!r2Client) {
    const accountId = requireEnv('R2_ACCOUNT_ID')
    const endpoint = process.env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`

    r2Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
      },
    })
  }

  return r2Client
}

function getPublicBaseUrl(): string {
  return requireEnv('R2_PUBLIC_BASE_URL').replace(/\/$/, '')
}

export function buildR2PublicUrl(key: string): string {
  return `${getPublicBaseUrl()}/${key.replace(/^\//, '')}`
}

export async function uploadBufferToR2(params: {
  buffer: Buffer
  key: string
  contentType: string
  timeoutMs?: number
}): Promise<{ url: string; key: string; bytes: number; mimeType: string; backend: 'r2' }> {
  const bucket = requireEnv('R2_BUCKET')
  const timeoutMs = params.timeoutMs ?? R2_UPLOAD_TIMEOUT_MS

  await Promise.race([
    getR2Client().send(new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.buffer,
      ContentType: params.contentType,
    })),
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`R2 upload timed out after ${timeoutMs}ms`))
      }, timeoutMs)
    }),
  ])

  return {
    url: buildR2PublicUrl(params.key),
    key: params.key,
    bytes: params.buffer.byteLength,
    mimeType: params.contentType,
    backend: 'r2',
  }
}
