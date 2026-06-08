'use client'

export interface DashboardUser {
  id: string
  email: string
  name: string | null
  role: 'ADMIN' | 'USER'
  enabled: boolean
}

export async function fetchCurrentUser(): Promise<DashboardUser | null> {
  const res = await fetch('/api/v1/auth/me', {
    credentials: 'include',
    cache: 'no-store',
  })

  if (!res.ok) return null

  const data = await res.json().catch(() => null)
  return data?.user ?? null
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await fetchCurrentUser()
  return !!user
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/v1/auth/logout', {
      method: 'POST',
      credentials: 'include',
    })
  } finally {
    window.location.href = '/dashboard/login'
  }
}
