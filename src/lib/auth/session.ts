import { cookies } from 'next/headers'
import { prisma } from '@/lib/db/prisma'
import { generateOpaqueToken, hashOpaqueToken } from '@/lib/crypto'

export const SESSION_COOKIE_NAME = 'session_token'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7 // 7 days

export function getSessionExpiryDate() {
  return new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000)
}

export async function createSession(userId: string) {
  const token = generateOpaqueToken()
  const tokenHash = hashOpaqueToken(token)
  const expiresAt = getSessionExpiryDate()

  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  })

  return { token, session }
}

export async function deleteSessionByToken(token: string) {
  const tokenHash = hashOpaqueToken(token)
  await prisma.session.deleteMany({
    where: { tokenHash },
  })
}

export async function getSessionWithUserByToken(token: string) {
  const tokenHash = hashOpaqueToken(token)
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  })

  if (!session) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined)
    return null
  }
  if (!session.user.enabled) {
    return null
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date() },
  }).catch(() => undefined)

  return session
}

export async function getCurrentSessionFromCookies() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value
  if (!token) return null
  return getSessionWithUserByToken(token)
}

export function getSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  }
}
