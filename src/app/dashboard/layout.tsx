'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { fetchCurrentUser, logout, type DashboardUser } from '@/lib/dashboard/auth'

type NavItem = { href: string; label: string }

const USER_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/tasks', label: 'My Tasks' },
  { href: '/dashboard/settings', label: 'API Keys' },
  { href: '/dashboard/account', label: 'Account' },
]

const ADMIN_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/users', label: 'Users' },
  { href: '/dashboard/providers', label: 'Providers' },
  { href: '/dashboard/test-image', label: 'Test Image' },
  { href: '/dashboard/tasks', label: 'Tasks' },
  { href: '/dashboard/stats', label: 'Statistics' },
  { href: '/dashboard/settings', label: 'Management' },
  { href: '/dashboard/account', label: 'Account' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [loading, setLoading] = useState(true)

  const isAuthPage = pathname === '/dashboard/login' || pathname === '/dashboard/register'

  useEffect(() => {
    if (isAuthPage) {
      setLoading(false)
      return
    }

    let mounted = true
    fetchCurrentUser()
      .then((u) => {
        if (!mounted) return
        if (!u) {
          router.push('/dashboard/login')
          return
        }
        setUser(u)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [isAuthPage, router])

  if (isAuthPage) {
    return <>{children}</>
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    )
  }

  const navItems = user.role === 'ADMIN' ? ADMIN_NAV : USER_NAV

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-64 bg-gray-900 text-white p-4 shrink-0">
        <div className="mb-6">
          <h1 className="text-lg font-bold">🖼️ Image Worker</h1>
          <p className="text-xs text-gray-400 mt-2">{user.email}</p>
          <span className="inline-flex mt-2 px-2 py-0.5 rounded text-xs font-medium bg-gray-800 text-gray-200">
            {user.role}
          </span>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`block px-3 py-2 rounded transition-colors ${active ? 'bg-blue-600 text-white' : 'hover:bg-gray-800 text-gray-100'}`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <button
          onClick={() => logout()}
          className="mt-6 w-full px-3 py-2 rounded bg-gray-800 hover:bg-gray-700 text-sm text-left"
        >
          Sign Out
        </button>
      </aside>
      <main className="flex-1 p-6 overflow-auto">{children}</main>
    </div>
  )
}
