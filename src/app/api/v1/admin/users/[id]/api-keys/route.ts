import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdminRequest } from '@/lib/auth/request-auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const result = await requireAdminRequest(request)
    if ('error' in result) {
      return result.error
    }

    const { id } = await params

    const keys = await prisma.apiKey.findMany({
      where: { ownerUserId: id, revokedAt: null },
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
