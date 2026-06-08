import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const keys = await prisma.apiKey.findMany({
      where: { ownerUserId: id },
      include: { quota: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      keys: keys.map(({ keyHash, ...rest }) => rest),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
