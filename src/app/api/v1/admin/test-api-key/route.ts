import { NextRequest, NextResponse } from 'next/server'
import { createApiKey, revokeApiKeyForUser } from '@/lib/auth/api-key-service'
import { requireAdminRequest } from '@/lib/auth/request-auth'

export async function POST(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }
    const { auth } = result

    const body = await request.json().catch(() => ({}))
    const name = typeof body?.name === 'string' && body.name.trim()
      ? body.name.trim()
      : `Admin Test Key ${new Date().toISOString()}`

    const created = await createApiKey(name, auth.userId)
    return NextResponse.json({ data: created }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }
    const { auth } = result

    const body = await request.json().catch(() => ({}))
    const id = typeof body?.id === 'string' ? body.id : ''
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    await revokeApiKeyForUser(id, auth.userId)
    return NextResponse.json({ data: { id, revoked: true } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
