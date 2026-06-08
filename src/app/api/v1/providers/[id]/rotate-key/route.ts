import { NextRequest, NextResponse } from 'next/server'
import { requireAdminRequest } from '@/lib/auth/request-auth'
import { rotateProviderApiKey } from '@/lib/providers/provider-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }

    const { id } = await params

    const body = await request.json()
    const { apiKeyPlaintext } = body as { apiKeyPlaintext?: string }

    if (!apiKeyPlaintext) {
      return NextResponse.json(
        { error: 'apiKeyPlaintext is required' },
        { status: 400 },
      )
    }

    const provider = await rotateProviderApiKey(id, apiKeyPlaintext)

    return NextResponse.json({ data: provider })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
