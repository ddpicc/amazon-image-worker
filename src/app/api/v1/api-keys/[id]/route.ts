import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { revokeApiKey } from '@/lib/auth/api-key-service'
import { setQuota } from '@/lib/auth/quota-service'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const body = await request.json()
    const { name, enabled, dailyLimit, monthlyLimit } = body as {
      name?: string
      enabled?: boolean
      dailyLimit?: number
      monthlyLimit?: number
    }

    // Check that the API key exists
    const existing = await prisma.apiKey.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }

    // Update API key fields
    const updateData: Record<string, unknown> = {}
    if (name !== undefined) updateData.name = name
    if (enabled !== undefined) updateData.enabled = enabled

    const updated = await prisma.apiKey.update({
      where: { id },
      data: updateData,
    })

    // Update quota if limits were provided
    if (dailyLimit !== undefined || monthlyLimit !== undefined) {
      await setQuota(id, dailyLimit ?? null, monthlyLimit ?? null)
    }

    // Return without keyHash
    const { keyHash, ...sanitized } = updated
    return NextResponse.json({ data: sanitized })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    await revokeApiKey(id)

    return NextResponse.json({ data: { revoked: true, id } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
