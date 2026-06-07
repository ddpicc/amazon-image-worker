import { prisma } from '@/lib/db/prisma'
import {
  generateRawApiKey,
  hashApiKey,
  extractKeyPrefix,
} from './api-key'

export interface CreateApiKeyResult {
  id: string
  name: string
  key: string
  keyPrefix: string
  createdAt: Date
}

/**
 * Create a new API key. The raw key is returned exactly once —
 * only the hash and prefix are persisted.
 */
export async function createApiKey(name: string): Promise<CreateApiKeyResult> {
  const rawKey = generateRawApiKey()
  const keyHash = hashApiKey(rawKey)
  const keyPrefix = extractKeyPrefix(rawKey)

  const record = await prisma.apiKey.create({
    data: {
      name,
      keyHash,
      keyPrefix,
    },
  })

  return {
    id: record.id,
    name: record.name,
    key: rawKey,
    keyPrefix: record.keyPrefix,
    createdAt: record.createdAt,
  }
}

/**
 * Validate a raw API key. Hashes the provided key and looks up an enabled
 * ApiKey record with a matching keyHash.
 * Returns the ApiKey record if valid, or null otherwise.
 */
export async function validateApiKey(rawKey: string) {
  if (!rawKey.startsWith('imgw_')) {
    return null
  }

  const keyHash = hashApiKey(rawKey)

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
  })

  if (!apiKey || !apiKey.enabled) {
    return null
  }

  return apiKey
}

/**
 * Rotate an API key — generates a new raw key and replaces the hash
 * and prefix on the existing record. The old key immediately becomes invalid.
 * Returns the new raw key.
 */
export async function rotateApiKey(keyId: string): Promise<string> {
  const rawKey = generateRawApiKey()
  const keyHash = hashApiKey(rawKey)
  const keyPrefix = extractKeyPrefix(rawKey)

  await prisma.apiKey.update({
    where: { id: keyId },
    data: { keyHash, keyPrefix },
  })

  return rawKey
}

/**
 * Revoke an API key by setting enabled = false.
 */
export async function revokeApiKey(keyId: string): Promise<void> {
  await prisma.apiKey.update({
    where: { id: keyId },
    data: { enabled: false },
  })
}

/**
 * List all API key records. The keyHash is included but the raw key
 * is not available (it is never stored).
 */
export async function listApiKeys() {
  return prisma.apiKey.findMany({
    orderBy: { createdAt: 'desc' },
  })
}

/**
 * Look up a single API key by its id.
 */
export async function getApiKeyById(id: string) {
  return prisma.apiKey.findUnique({
    where: { id },
  })
}
