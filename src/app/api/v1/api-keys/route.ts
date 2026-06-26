import { NextRequest, NextResponse } from 'next/server'
import { createApiKey, listAllApiKeysForAdmin, listApiKeysByUser } from '@/lib/auth/api-key-service'
import { requireRequestAuth } from '@/lib/auth/request-auth'
import { enforceRateLimit } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  try {
    const result = await requireRequestAuth(request)
    if ('error' in result) {
      return result.error
    }
    const { auth } = result

    const keys = auth.role === 'ADMIN'
      ? await listAllApiKeysForAdmin()
      : await listApiKeysByUser(auth.userId)

    const sanitized = keys.map(({ keyHash, ...rest }) => rest)
    return NextResponse.json({ keys: sanitized })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const result = await requireRequestAuth(request)
    if ('error' in result) {
      return result.error
    }
    const { auth } = result

    if (auth.role === 'ADMIN') {
      return NextResponse.json({ error: 'Admins do not create personal API keys' }, { status: 403 })
    }

    const rateLimitResponse = await enforceRateLimit(request, {
      key: `api-keys:create:${auth.userId}`,
      limit: 10,
      windowSeconds: 60 * 60,
    })
    if (rateLimitResponse) return rateLimitResponse

    const body = await request.json()
    const { name } = body as {
      name?: string
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const created = await createApiKey(name.trim(), auth.userId)
    return NextResponse.json({ apiKey: created.key, data: created }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
