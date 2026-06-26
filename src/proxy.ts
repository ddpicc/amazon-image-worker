import { NextRequest, NextResponse } from 'next/server'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

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
