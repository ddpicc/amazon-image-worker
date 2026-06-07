import { NextRequest, NextResponse } from 'next/server'
import { resetCircuitBreaker } from '@/lib/providers/circuit-breaker'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    await resetCircuitBreaker(id)

    return NextResponse.json({ data: { reset: true, providerId: id } })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
