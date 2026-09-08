import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getCurrentSessionFromCookies } from '@/lib/auth/session'
import { ensureBootstrapAdmin } from '@/lib/auth/bootstrap-admin'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import { fenToYuan } from '@/lib/money'

export async function GET() {
  try {
    await ensureBootstrapAdmin()

    const session = await getCurrentSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json({
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        role: session.user.role,
        enabled: session.user.enabled,
        balance: fenToYuan(session.user.balanceFen ?? 0),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getCurrentSessionFromCookies()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, currentPassword, newPassword } = body as {
      name?: string
      currentPassword?: string
      newPassword?: string
    }

    const updateData: Record<string, unknown> = {}

    if (typeof name === 'string') {
      updateData.name = name.trim() || null
    }

    if (newPassword !== undefined) {
      if (!currentPassword || typeof currentPassword !== 'string') {
        return NextResponse.json({ error: 'Current password is required' }, { status: 400 })
      }
      if (typeof newPassword !== 'string' || newPassword.length < 8) {
        return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
      }

      const valid = await verifyPassword(currentPassword, session.user.passwordHash)
      if (!valid) {
        return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
      }

      updateData.passwordHash = await hashPassword(newPassword)
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No changes provided' }, { status: 400 })
    }

    const user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: session.user.id },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          enabled: true,
          balanceFen: true,
        },
      })

      if (newPassword !== undefined) {
        await tx.session.deleteMany({
          where: {
            userId: session.user.id,
            id: { not: session.id },
          },
        })
      }

      return updated
    })

    return NextResponse.json({
      user: {
        ...user,
        balance: fenToYuan(user.balanceFen),
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
