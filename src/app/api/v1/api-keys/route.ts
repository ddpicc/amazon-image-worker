import { NextRequest, NextResponse } from 'next/server'
import { createApiKey, listAllApiKeysForAdmin, listApiKeysByUser } from '@/lib/auth/api-key-service'

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    const userRole = request.headers.get('x-user-role')

    if (!userId || !userRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const keys = userRole === 'ADMIN'
      ? await listAllApiKeysForAdmin()
      : await listApiKeysByUser(userId)

    const sanitized = keys.map(({ keyHash, ...rest }) => rest)
    return NextResponse.json({ keys: sanitized })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id')
    const userRole = request.headers.get('x-user-role')
    if (!userId || !userRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (userRole === 'ADMIN') {
      return NextResponse.json({ error: 'Admins do not create personal API keys' }, { status: 403 })
    }

    const body = await request.json()
    const { name } = body as {
      name?: string
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const result = await createApiKey(name.trim(), userId)
    return NextResponse.json({ apiKey: result.key, data: result }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
