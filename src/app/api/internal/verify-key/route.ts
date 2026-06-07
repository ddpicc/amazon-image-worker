import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

/**
 * Internal endpoint called by middleware to verify API keys.
 * Not exposed to external users (middleware doesn't match /api/internal/*).
 */
export async function POST(request: NextRequest) {
  try {
    const { keyHash } = await request.json()
    if (!keyHash || typeof keyHash !== 'string') {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash, enabled: true },
      select: { id: true, name: true },
    })

    if (!apiKey) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json(apiKey)
  } catch {
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
