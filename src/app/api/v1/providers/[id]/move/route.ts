import { NextRequest, NextResponse } from 'next/server'
import { moveProviderPriority } from '@/lib/providers/provider-service'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const body = await request.json()
    const { direction } = body as { direction?: string }

    if (!direction || (direction !== 'up' && direction !== 'down')) {
      return NextResponse.json(
        { error: 'direction must be "up" or "down"' },
        { status: 400 },
      )
    }

    const provider = await moveProviderPriority(id, direction)

    return NextResponse.json({ data: provider })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
