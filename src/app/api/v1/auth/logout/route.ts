import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { deleteSessionByToken, getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/auth/session'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

    if (token) {
      await deleteSessionByToken(token).catch(() => undefined)
    }

    const response = NextResponse.json({ ok: true })
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      ...getSessionCookieOptions(),
      maxAge: 0,
    })
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
