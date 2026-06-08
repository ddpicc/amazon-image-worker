import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getApiKeyByIdForUser, revokeApiKeyForUser } from '@/lib/auth/api-key-service'

export async function PUT(
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
    const body = await request.json()
    const { name, enabled } = body as {
      name?: string
      enabled?: boolean
    }

    const existing = userRole === 'ADMIN'
      ? await prisma.apiKey.findUnique({ where: { id }, include: { quota: true } })
      : await getApiKeyByIdForUser(id, userId)

    if (!existing) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (enabled !== undefined) updateData.enabled = enabled

    const updated = await prisma.apiKey.update({
      where: { id },
      data: updateData,
      include: { quota: true },
    })

    const { keyHash, ...sanitized } = updated
    return NextResponse.json({ data: sanitized })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
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
      await prisma.apiKey.update({
        where: { id },
        data: { enabled: false },
      })
    } else {
      await revokeApiKeyForUser(id, userId)
    }

    return NextResponse.json({ data: { revoked: true, id } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
