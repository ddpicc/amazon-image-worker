import { NextRequest, NextResponse } from 'next/server'
import { parse } from 'cookie'
import { SESSION_COOKIE_NAME } from '@/lib/auth/session'

async function hashApiKeyEdge(rawKey: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${process.env.APP_SECRET}:${rawKey}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function getSessionTokenFromRequest(request: NextRequest): string | null {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return null
  const cookies = parse(cookieHeader)
  return cookies[SESSION_COOKIE_NAME] ?? null
}

async function verifyApiKey(request: NextRequest, rawKey: string) {
  const keyHash = await hashApiKeyEdge(rawKey)
  const verifyRes = await fetch(new URL('/api/internal/verify-key', request.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyHash }),
  })

  if (!verifyRes.ok) return null
  return verifyRes.json()
}

async function verifySession(request: NextRequest, token: string) {
  const verifyRes = await fetch(new URL('/api/internal/verify-session', request.url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })

  if (!verifyRes.ok) return null
  return verifyRes.json()
}

function withAuthHeaders(request: NextRequest, headersToSet: Record<string, string>) {
  const requestHeaders = new Headers(request.headers)
  for (const [key, value] of Object.entries(headersToSet)) {
    requestHeaders.set(key, value)
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const sessionToken = getSessionTokenFromRequest(request)
  const authHeader = request.headers.get('authorization')

  // ------------------------------------------------------------
  // Public auth routes
  // ------------------------------------------------------------
  if (
    pathname === '/api/v1/auth/login' ||
    pathname === '/api/v1/auth/register' ||
    pathname === '/api/v1/auth/logout' ||
    pathname === '/api/v1/auth/me'
  ) {
    if (pathname === '/api/v1/auth/me' && sessionToken) {
      const verified = await verifySession(request, sessionToken).catch(() => null)
      if (verified?.user) {
        return withAuthHeaders(request, {
          'x-auth-type': 'session',
          'x-user-id': verified.user.id,
          'x-user-role': verified.user.role,
          'x-session-id': verified.session.id,
        })
      }
    }

    return NextResponse.next()
  }

  // ------------------------------------------------------------
  // Internal verification routes are only called by proxy
  // ------------------------------------------------------------
  if (pathname.startsWith('/api/internal/')) {
    return NextResponse.next()
  }

  // ------------------------------------------------------------
  // Machine/API-key authenticated task creation and scoped task access
  // ------------------------------------------------------------
  if (pathname.startsWith('/api/v1/tasks')) {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const rawKey = authHeader.slice('Bearer '.length)
      const apiKey = await verifyApiKey(request, rawKey).catch(() => null)

      if (!apiKey) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      return withAuthHeaders(request, {
        'x-auth-type': 'api-key',
        'x-api-key-id': apiKey.id,
        'x-api-key-name': apiKey.name,
        'x-user-id': apiKey.ownerUserId,
        'x-user-role': apiKey.ownerUserRole ?? 'USER',
      })
    }

    if (sessionToken) {
      const verified = await verifySession(request, sessionToken).catch(() => null)
      if (verified?.user) {
        return withAuthHeaders(request, {
          'x-auth-type': 'session',
          'x-user-id': verified.user.id,
          'x-user-role': verified.user.role,
          'x-session-id': verified.session.id,
        })
      }

      return NextResponse.next()
    }

    return NextResponse.next()
  }

  // ------------------------------------------------------------
  // Admin-only operational routes
  // ------------------------------------------------------------
  const adminRoutes = [
    '/api/v1/providers',
    '/api/v1/stats',
    '/api/v1/alerts',
    '/api/v1/admin',
  ]

  const isAdminRoute = adminRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )

  if (isAdminRoute) {
    if (sessionToken) {
      const verified = await verifySession(request, sessionToken).catch(() => null)
      if (verified?.user && verified.user.role === 'ADMIN') {
        return withAuthHeaders(request, {
          'x-auth-type': 'session',
          'x-user-id': verified.user.id,
          'x-user-role': verified.user.role,
          'x-session-id': verified.session.id,
        })
      }
    }

    return NextResponse.next()
  }

  // ------------------------------------------------------------
  // User-scoped authenticated routes (api-keys today, more later)
  // ------------------------------------------------------------
  const userRoutes = [
    '/api/v1/api-keys',
    '/api/v1/auth/me',
  ]

  const isUserRoute = userRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )

  if (isUserRoute) {
    if (sessionToken) {
      const verified = await verifySession(request, sessionToken).catch(() => null)
      if (verified?.user) {
        return withAuthHeaders(request, {
          'x-auth-type': 'session',
          'x-user-id': verified.user.id,
          'x-user-role': verified.user.role,
          'x-session-id': verified.session.id,
        })
      }
    }

    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/v1/:path*', '/api/internal/:path*'],
}
