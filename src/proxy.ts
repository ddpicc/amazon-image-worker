import { NextRequest, NextResponse } from 'next/server'

async function hashApiKeyEdge(rawKey: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${process.env.APP_SECRET}:${rawKey}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
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
  if (
    pathname.startsWith('/api/v1/tasks') ||
    pathname.startsWith('/api/v1/images/') ||
    pathname.startsWith('/v1/images/')
  ) {
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const rawKey = authHeader.slice('Bearer '.length)
      const apiKey = await verifyApiKey(request, rawKey).catch(() => null)

      if (apiKey) {
        return withAuthHeaders(request, {
          'x-auth-type': 'api-key',
          'x-api-key-id': apiKey.id,
          'x-api-key-name': apiKey.name,
          'x-user-id': apiKey.ownerUserId,
          'x-user-role': apiKey.ownerUserRole ?? 'USER',
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
    return NextResponse.next()
  }

  // ------------------------------------------------------------
  // User-scoped authenticated routes (api-keys today, more later)
  // ------------------------------------------------------------
  const userRoutes = [
    '/api/v1/api-keys',
    '/api/v1/auth/me',
    '/api/v1/usage',
  ]

  const isUserRoute = userRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )

  if (isUserRoute) {
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/v1/:path*', '/api/internal/:path*', '/v1/:path*'],
}
