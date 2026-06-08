import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params

    const updated = await prisma.user.update({
      where: { id },
      data: { enabled: false },
      select: {
        id: true,
        email: true,
        role: true,
        enabled: true,
      },
    })

    await prisma.session.deleteMany({
      where: { userId: id },
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
