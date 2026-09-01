import { prisma } from '@/lib/db/prisma'
import { generateEmailVerificationCode, hashEmailVerificationCode } from '@/lib/crypto'

const CODE_TTL_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const RESEND_INTERVAL_MS = 60 * 1000

const RESEND_API_URL = 'https://api.resend.com/emails'

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'expired' | 'tooManyAttempts' }

export function isEmailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY)
}

function verificationEmailHtml(code: string) {
  return `
<div style="max-width:480px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#111827;">
  <h1 style="font-size:20px;margin:0 0 16px;">Image Worker 邮箱验证</h1>
  <p style="font-size:14px;line-height:1.6;color:#374151;margin:0 0 24px;">
    你正在注册 Image Worker 账号。请使用下面的验证码完成邮箱验证：
  </p>
  <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;background:#f3f4f6;border-radius:8px;padding:16px 0;margin:0 0 24px;">
    ${code}
  </div>
  <p style="font-size:13px;color:#6b7280;line-height:1.6;margin:0;">
    验证码 10 分钟内有效。如果不是你本人的操作，请忽略这封邮件。
  </p>
</div>
`.trim()
}

async function sendVerificationEmail(email: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // 开发模式：未配置 Resend 时只在服务端日志输出验证码
    console.log(`[email-verification] RESEND_API_KEY 未配置，跳过发送。${email} 的验证码: ${code}`)
    return
  }

  const from = process.env.EMAIL_FROM || 'Image Worker <onboarding@resend.dev>'
  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `Image Worker 验证码：${code}`,
      html: verificationEmailHtml(code),
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend 发送失败 (${res.status}): ${body.slice(0, 300)}`)
  }
}

export async function issueEmailVerificationCode(
  email: string,
): Promise<{ ok: true; devCode?: string } | { ok: false; reason: 'rateLimited' | 'sendFailed'; message?: string }> {
  const normalizedEmail = email.trim().toLowerCase()

  const latest = await prisma.emailVerificationCode.findFirst({
    where: { email: normalizedEmail },
    orderBy: { createdAt: 'desc' },
  })

  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_INTERVAL_MS) {
    return { ok: false, reason: 'rateLimited' }
  }

  const code = generateEmailVerificationCode()
  await prisma.emailVerificationCode.create({
    data: {
      email: normalizedEmail,
      codeHash: hashEmailVerificationCode(normalizedEmail, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  })

  try {
    await sendVerificationEmail(normalizedEmail, code)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'send failed'
    console.error('[email-verification] 发送验证邮件失败', { email: normalizedEmail, message })
    return { ok: false, reason: 'sendFailed', message }
  }

  const devCode = isEmailDeliveryConfigured() || process.env.NODE_ENV === 'production' ? undefined : code
  return { ok: true, devCode }
}

export async function verifyEmailCode(email: string, code: string): Promise<VerifyCodeResult> {
  const normalizedEmail = email.trim().toLowerCase()
  const trimmedCode = code.trim()

  const record = await prisma.emailVerificationCode.findFirst({
    where: { email: normalizedEmail, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!record) {
    return { ok: false, reason: 'invalid' }
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'tooManyAttempts' }
  }

  if (record.expiresAt.getTime() <= Date.now()) {
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    }).catch(() => undefined)
    return { ok: false, reason: 'expired' }
  }

  if (record.codeHash !== hashEmailVerificationCode(normalizedEmail, trimmedCode)) {
    await prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    }).catch(() => undefined)
    return { ok: false, reason: 'invalid' }
  }

  await prisma.emailVerificationCode.update({
    where: { id: record.id },
    data: { consumedAt: new Date() },
  })

  return { ok: true }
}
