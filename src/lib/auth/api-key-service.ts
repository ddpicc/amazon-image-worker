import crypto from 'crypto'
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

const ADMIN_TEST_KEY_NAME = 'Admin Test Key'

function generateAdminTestRawApiKey(ownerUserId: string): string {
  const digest = crypto
    .createHash('sha256')
    .update(`${process.env.APP_SECRET}:admin-test:${ownerUserId}`)
    .digest('hex')

  return `imgw_${digest.slice(0, 48)}`
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

export async function ensureAdminTestApiKey(ownerUserId: string): Promise<CreateApiKeyResult> {
  const rawKey = generateAdminTestRawApiKey(ownerUserId)
  const keyHash = hashApiKey(rawKey)
  const keyPrefix = extractKeyPrefix(rawKey)

  const existing = await prisma.apiKey.findFirst({
    where: {
      ownerUserId,
      name: ADMIN_TEST_KEY_NAME,
    },
    orderBy: { createdAt: 'asc' },
  })

  const record = existing
    ? await prisma.apiKey.update({
        where: { id: existing.id },
        data: {
          keyHash,
          keyPrefix,
          enabled: true,
        },
      })
    : await prisma.apiKey.create({
        data: {
          ownerUserId,
          name: ADMIN_TEST_KEY_NAME,
          keyHash,
          keyPrefix,
          enabled: true,
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
