/**
 * Dashboard authentication helpers — client-side cookie management
 * for the admin_token used by middleware.
 */

export function getAdminToken(): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith('admin_token='))
  if (!match) return null
  return match.split('=')[1] ?? null
}

export function isAuthenticated(): boolean {
  return getAdminToken() !== null
}

export function logout(): void {
  document.cookie = 'admin_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
  window.location.href = '/dashboard/login'
}
