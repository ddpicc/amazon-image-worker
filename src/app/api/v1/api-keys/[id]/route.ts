import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getApiKeyByIdForUser, revokeApiKeyForUser } from '@/lib/auth/api-key-service'
import { requireRequestAuth } from '@/lib/auth/request-auth'

export async function PUT(
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
    const body = await request.json()
    const { name, enabled } = body as {
      name?: string
      enabled?: boolean
    }

    const existing = auth.role === 'ADMIN'
      ? await prisma.apiKey.findUnique({ where: { id }, include: { quota: true } })
      : await getApiKeyByIdForUser(id, auth.userId)

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
    const result = await requireRequestAuth(request)
    if ('error' in result) {
      return result.error
    }
    const { auth } = result

    const { id } = await params

    if (auth.role === 'ADMIN') {
      await prisma.apiKey.update({
        where: { id },
        data: { enabled: false },
      })
    } else {
      await revokeApiKeyForUser(id, auth.userId)
    }

    return NextResponse.json({ data: { revoked: true, id } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
