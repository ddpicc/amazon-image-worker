import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

function getInternalApiSecret() {
  return process.env.INTERNAL_API_SECRET || process.env.APP_SECRET
}

function secretsMatch(provided: string | null, expected: string) {
  if (!provided) return false
  const providedBuffer = Buffer.from(provided)
  const expectedBuffer = Buffer.from(expected)
  if (providedBuffer.length !== expectedBuffer.length) return false
  return crypto.timingSafeEqual(providedBuffer, expectedBuffer)
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = getInternalApiSecret()
    const providedSecret = request.headers.get('x-internal-api-secret')
    if (!expectedSecret || !secretsMatch(providedSecret, expectedSecret)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { keyHash } = await request.json()
    if (!keyHash || typeof keyHash !== 'string') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        name: true,
        enabled: true,
        ownerUserId: true,
        ownerUser: {
          select: {
            id: true,
            role: true,
            enabled: true,
          },
        },
      },
    })

    if (!apiKey || !apiKey.enabled || !apiKey.ownerUser || !apiKey.ownerUser.enabled) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: apiKey.id,
      name: apiKey.name,
      ownerUserId: apiKey.ownerUserId,
      ownerUserRole: apiKey.ownerUser.role,
    })
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
