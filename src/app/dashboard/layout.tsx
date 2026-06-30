'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { fetchCurrentUser, logout, type DashboardUser } from '@/lib/dashboard/auth'
import { DashboardI18nProvider, roleLabel, useDashboardI18n } from '@/lib/dashboard/i18n'

type NavItem = { href: string; label: string }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardI18nProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </DashboardI18nProvider>
  )
}

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { lang, setLang, t } = useDashboardI18n()
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
    return (
      <div className="relative">
        <div className="absolute right-4 top-4 z-10">
          <LanguageToggle />
        </div>
        {children}
      </div>
    )
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">{t('loadingDashboard')}</div>
      </div>
    )
  }

  const USER_NAV: NavItem[] = [
    { href: '/dashboard', label: t('navOverview') },
    { href: '/dashboard/activity', label: t('navActivity') },
    { href: '/dashboard/payments', label: t('navRecharge') },
    { href: '/dashboard/settings', label: t('navApiKeys') },
    { href: '/dashboard/docs', label: t('navApiDocs') },
    { href: '/dashboard/account', label: t('navAccount') },
  ]

  const ADMIN_NAV: NavItem[] = [
    { href: '/dashboard', label: t('navOverview') },
    { href: '/dashboard/users', label: t('navUsers') },
    { href: '/dashboard/providers', label: t('navProviders') },
    { href: '/dashboard/test-image', label: t('navTestImage') },
    { href: '/dashboard/tasks', label: t('navTasks') },
    { href: '/dashboard/stats', label: t('navStatistics') },
    { href: '/dashboard/pricing', label: t('navPricing') },
    { href: '/dashboard/billing', label: t('navBilling') },
    { href: '/dashboard/payments', label: t('navPayments') },
    { href: '/dashboard/debug', label: t('navDebug') },
    { href: '/dashboard/docs', label: t('navApiDocs') },
    { href: '/dashboard/settings', label: t('navManagement') },
    { href: '/dashboard/account', label: t('navAccount') },
  ]

  const navItems = user.role === 'ADMIN' ? ADMIN_NAV : USER_NAV

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-64 bg-gray-900 text-white p-4 shrink-0">
        <div className="mb-6">
          <h1 className="text-lg font-bold">{t('appName')}</h1>
          <p className="text-xs text-gray-400 mt-2">{user.email}</p>
          <span className="inline-flex mt-2 px-2 py-0.5 rounded text-xs font-medium bg-gray-800 text-gray-200">
            {roleLabel(lang, user.role)}
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
          {t('signOut')}
        </button>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <div className="mb-6 flex justify-end">
          <LanguageToggle />
        </div>
        {children}
      </main>
    </div>
  )
}

function LanguageToggle() {
  const { lang, setLang, t } = useDashboardI18n()

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 text-sm shadow-sm">
      <span className="px-2 text-gray-500">{t('language')}</span>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`rounded-md px-3 py-1.5 transition-colors ${lang === 'en' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
      >
        {t('english')}
      </button>
      <button
        type="button"
        onClick={() => setLang('zh')}
        className={`rounded-md px-3 py-1.5 transition-colors ${lang === 'zh' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
      >
        {t('chinese')}
      </button>
    </div>
  )
}
