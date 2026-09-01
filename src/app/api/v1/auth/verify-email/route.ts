import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { createSession, getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/auth/session'
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit'
import { verifyEmailCode } from '@/lib/auth/email-verification'

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await enforceRateLimit(request, {
      key: `auth:verify-email:${getClientIp(request)}`,
      limit: 20,
      windowSeconds: 15 * 60,
    })
    if (rateLimitResponse) return rateLimitResponse

    const { email, code } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: '请输入邮箱' }, { status: 400 })
    }
    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
      return NextResponse.json({ error: '请输入 6 位数字验证码' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    const result = await verifyEmailCode(normalizedEmail, code)
    if (!result.ok) {
      const messages = {
        invalid: '验证码错误',
        expired: '验证码已过期，请重新发送',
        tooManyAttempts: '尝试次数过多，请重新发送验证码',
      } as const
      return NextResponse.json({ error: messages[result.reason] }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user || !user.enabled) {
      return NextResponse.json({ error: '账号不存在或已被禁用' }, { status: 404 })
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    })

    const { token } = await createSession(user.id)
    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        enabled: user.enabled,
      },
    })
    response.cookies.set(SESSION_COOKIE_NAME, token, getSessionCookieOptions())
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
