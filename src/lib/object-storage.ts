import { uploadBufferToCos } from './cos'
import { uploadBufferToR2 } from './r2'

export type ObjectStorageBackend = 'cos' | 'r2'

export interface UploadBufferParams {
  buffer: Buffer
  key: string
  contentType: string
  timeoutMs?: number
}

export interface UploadedObject {
  url: string
  key: string
  bytes: number
  mimeType: string
  backend: ObjectStorageBackend
}

function getConfiguredBackend(): ObjectStorageBackend {
  const raw = (process.env.STORAGE_BACKEND || 'cos').trim().toLowerCase()
  return raw === 'r2' ? 'r2' : 'cos'
}

export function getObjectStorageBackend(): ObjectStorageBackend {
  return getConfiguredBackend()
}

export async function uploadBufferToObjectStorage(params: UploadBufferParams): Promise<UploadedObject> {
  const backend = getConfiguredBackend()
  return backend === 'r2' ? uploadBufferToR2(params) : uploadBufferToCos(params)
}
