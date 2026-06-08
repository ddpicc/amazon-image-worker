import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getApiKeyByIdForUser, rotateApiKeyForUser } from '@/lib/auth/api-key-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = request.headers.get('x-user-id')
    const userRole = request.headers.get('x-user-role')
    if (!userId || !userRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    if (userRole === 'ADMIN') {
      return NextResponse.json({ error: 'Admins do not rotate personal API keys here' }, { status: 403 })
    }

    const existing = await getApiKeyByIdForUser(id, userId)
    if (!existing) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    const newKey = await rotateApiKeyForUser(id, userId)

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
