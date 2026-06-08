import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { decryptSecret } from '@/lib/crypto'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const provider = await prisma.imageProvider.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        apiKeyCiphertext: true,
      },
    })

    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 })
    }

    const apiKey = decryptSecret(provider.apiKeyCiphertext)

    return NextResponse.json({
      data: {
        id: provider.id,
        name: provider.name,
        apiKey,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
