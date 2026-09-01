import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { hashPassword } from '@/lib/auth/password'
import { ensureBootstrapAdmin } from '@/lib/auth/bootstrap-admin'
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit'
import { issueEmailVerificationCode } from '@/lib/auth/email-verification'

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await enforceRateLimit(request, {
      key: `auth:register:${getClientIp(request)}`,
      limit: 5,
      windowSeconds: 60 * 60,
    })
    if (rateLimitResponse) return rateLimitResponse

    await ensureBootstrapAdmin()

    const { email, password, name } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: '请输入邮箱' }, { status: 400 })
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: '密码至少需要 8 个字符' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, emailVerifiedAt: true },
    })

    if (existing?.emailVerifiedAt) {
      return NextResponse.json({ error: '该邮箱已注册，请直接登录' }, { status: 409 })
    }

    const passwordHash = await hashPassword(password)

    if (existing) {
      // 邮箱已存在但尚未完成验证：更新注册信息后重新发送验证码
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash,
          name: typeof name === 'string' && name.trim() ? name.trim() : null,
        },
      })
    } else {
      await prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          name: typeof name === 'string' && name.trim() ? name.trim() : null,
          role: 'USER',
          enabled: true,
        },
      })
    }

    const issued = await issueEmailVerificationCode(normalizedEmail)
    if (!issued.ok) {
      if (issued.reason === 'rateLimited') {
        return NextResponse.json({ error: '验证码发送过于频繁，请 1 分钟后再试' }, { status: 429 })
      }
      return NextResponse.json(
        { error: '验证邮件发送失败，请稍后重试或更换邮箱后重新提交' },
        { status: 502 },
      )
    }

    return NextResponse.json(
      {
        requiresVerification: true,
        email: normalizedEmail,
        ...(issued.devCode ? { devCode: issued.devCode } : {}),
      },
      { status: 201 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
