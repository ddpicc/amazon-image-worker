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

export async function createApiKey(name: string, ownerUserId: string): Promise<CreateApiKeyResult> {
  const rawKey = generateRawApiKey()
  const keyHash = hashApiKey(rawKey)
  const keyPrefix = extractKeyPrefix(rawKey)

  const record = await prisma.apiKey.create({
    data: {
      ownerUserId,
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

export async function validateApiKey(rawKey: string) {
  if (!rawKey.startsWith('imgw_')) {
    return null
  }

  const keyHash = hashApiKey(rawKey)

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { ownerUser: true },
  })

  if (!apiKey || !apiKey.enabled || !apiKey.ownerUser || !apiKey.ownerUser.enabled) {
    return null
  }

  return apiKey
}

export async function rotateApiKeyForUser(keyId: string, ownerUserId: string): Promise<string> {
  const rawKey = generateRawApiKey()
  const keyHash = hashApiKey(rawKey)
  const keyPrefix = extractKeyPrefix(rawKey)

  await prisma.apiKey.updateMany({
    where: { id: keyId, ownerUserId },
    data: { keyHash, keyPrefix },
  })

  return rawKey
}

export async function revokeApiKeyForUser(keyId: string, ownerUserId: string): Promise<void> {
  await prisma.apiKey.updateMany({
    where: { id: keyId, ownerUserId },
    data: { enabled: false },
  })
}

export async function listApiKeysByUser(ownerUserId: string) {
  return prisma.apiKey.findMany({
    where: { ownerUserId },
    include: { quota: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getApiKeyByIdForUser(id: string, ownerUserId: string) {
  return prisma.apiKey.findFirst({
    where: { id, ownerUserId },
    include: { quota: true },
  })
}

export async function listAllApiKeysForAdmin() {
  return prisma.apiKey.findMany({
    include: {
      quota: true,
      ownerUser: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}
