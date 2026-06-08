import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getApiKeyByIdForUser, rotateApiKeyForUser } from '@/lib/auth/api-key-service'
import { requireRequestAuth } from '@/lib/auth/request-auth'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireRequestAuth(request)
    if ('error' in result) {
      return result.error
    }
    const { auth } = result

    const { id } = await params

    if (auth.role === 'ADMIN') {
      return NextResponse.json({ error: 'Admins do not rotate personal API keys here' }, { status: 403 })
    }

    const existing = await getApiKeyByIdForUser(id, auth.userId)
    if (!existing) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    const newKey = await rotateApiKeyForUser(id, auth.userId)

    const updated = await prisma.apiKey.findUnique({
      where: { id },
      include: { quota: true },
    })

    if (!updated) {
      return NextResponse.json({ error: 'API key not found after rotation' }, { status: 404 })
    }

    const { keyHash, ...sanitized } = updated
    return NextResponse.json({
      apiKey: newKey,
      data: sanitized,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
