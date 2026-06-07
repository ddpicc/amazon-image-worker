import { NextRequest, NextResponse } from 'next/server'
import { createApiKey, listApiKeys } from '@/lib/auth/api-key-service'
import { setQuota } from '@/lib/auth/quota-service'

export async function GET() {
  try {
    const keys = await listApiKeys()
    // Omit keyHash from response
    const sanitized = keys.map(({ keyHash, ...rest }) => rest)

    return NextResponse.json({ data: sanitized })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, dailyLimit, monthlyLimit } = body as {
      name?: string
      dailyLimit?: number
      monthlyLimit?: number
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const result = await createApiKey(name.trim())

    // Set quota if limits were provided
    if (dailyLimit !== undefined || monthlyLimit !== undefined) {
      await setQuota(result.id, dailyLimit ?? null, monthlyLimit ?? null)
    }

    return NextResponse.json({ data: result }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
