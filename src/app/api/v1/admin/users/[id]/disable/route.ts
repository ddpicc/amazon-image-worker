import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { requireAdminRequest } from '@/lib/auth/request-auth'

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

    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    })
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    if (target.role === 'ADMIN' || target.id === result.auth.userId) {
      return NextResponse.json({ error: '管理员账号不能被禁用' }, { status: 403 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id },
        data: { enabled: false },
        select: {
          id: true,
          email: true,
          role: true,
          enabled: true,
        },
      })

      await tx.session.deleteMany({ where: { userId: id } })
      await tx.auditLog.create({
        data: {
          actorUserId: result.auth.userId,
          targetUserId: id,
          action: 'user.disabled',
          resourceType: 'user',
          resourceId: id,
        },
      })

      return user
    })

    return NextResponse.json({ data: updated })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
