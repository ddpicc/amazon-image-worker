import { NextRequest, NextResponse } from 'next/server'

/**
 * Edge-compatible SHA-256 hash using Web Crypto API.
 * Mirrors the logic in @/lib/auth/api-key.ts but works in middleware (Edge Runtime).
 */
async function hashApiKeyEdge(rawKey: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(`${process.env.APP_SECRET}:${rawKey}`)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Check admin authentication via the admin_token cookie.
 * Returns true if the cookie matches the ADMIN_PASSWORD env var.
 */
function checkAdminAuth(request: NextRequest): boolean {
  const token = request.cookies.get('admin_token')?.value
  if (!token) return false
  return token === process.env.ADMIN_PASSWORD
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // ------------------------------------------------------------------
  // Routes that require API Key Bearer-token authentication
  // ------------------------------------------------------------------
  if (pathname.startsWith('/api/v1/tasks')) {
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      )
    }

    const rawKey = authHeader.slice('Bearer '.length)

    // Edge-compatible validation: hash with Web Crypto and query DB via fetch
    // We can't use Prisma in Edge Runtime, so we delegate to an internal API
    const keyHash = await hashApiKeyEdge(rawKey)

    // Call an internal verification endpoint (or use a lightweight DB client)
    // Since we can't use Prisma in middleware, we'll use a different approach:
    // Forward to the route handler and let it handle auth
    // Actually, the simplest approach: call the internal API
    try {
      const verifyRes = await fetch(new URL('/api/internal/verify-key', request.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyHash }),
      })
      if (!verifyRes.ok) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const apiKey = await verifyRes.json()

      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-api-key-id', apiKey.id)
      requestHeaders.set('x-api-key-name', apiKey.name)

      return NextResponse.next({
        request: { headers: requestHeaders },
      })
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  // ------------------------------------------------------------------
  // Admin routes — require cookie-based admin auth
  // ------------------------------------------------------------------
  const adminRoutes = [
    '/api/v1/providers',
    '/api/v1/stats',
    '/api/v1/api-keys',
    '/api/v1/alerts',
  ]

  const isAdminRoute = adminRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  )

  if (isAdminRoute) {
    if (!checkAdminAuth(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 },
      )
    }

    return NextResponse.next()
  }

  // ------------------------------------------------------------------
  // All other routes — pass through
  // ------------------------------------------------------------------
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/v1/:path*'],
}
