import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { enforceRateLimit, getClientIp } from '@/lib/rate-limit'
import { issueEmailVerificationCode } from '@/lib/auth/email-verification'

export async function POST(request: NextRequest) {
  try {
    const rateLimitResponse = await enforceRateLimit(request, {
      key: `auth:resend-verification:${getClientIp(request)}`,
      limit: 10,
      windowSeconds: 60 * 60,
    })
    if (rateLimitResponse) return rateLimitResponse

    const { email } = await request.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: '请输入邮箱' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // 防止邮箱枚举：无论账号是否存在/是否已验证，统一返回成功
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, emailVerifiedAt: true, enabled: true },
    })

    if (!user || user.emailVerifiedAt || !user.enabled) {
      return NextResponse.json({ ok: true })
    }

    const issued = await issueEmailVerificationCode(normalizedEmail)
    if (!issued.ok) {
      if (issued.reason === 'rateLimited') {
        return NextResponse.json({ error: '验证码发送过于频繁，请 1 分钟后再试' }, { status: 429 })
      }
      return NextResponse.json({ error: '验证邮件发送失败，请稍后重试' }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      ...(issued.devCode ? { devCode: issued.devCode } : {}),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
