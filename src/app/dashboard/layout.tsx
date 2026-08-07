'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, X } from 'lucide-react'
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

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
    <div className="min-h-screen bg-gray-50 lg:flex">
      <header className="sticky top-0 z-30 flex min-h-14 items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 shadow-sm lg:hidden">
        <h1 className="min-w-0 truncate text-base font-bold text-gray-900">{t('appName')}</h1>
        <button
          type="button"
          onClick={() => setMobileNavOpen(true)}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-700 transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label={lang === 'zh' ? '打开导航菜单' : 'Open navigation menu'}
          aria-expanded={mobileNavOpen}
        >
          <Menu className="h-6 w-6" aria-hidden="true" />
        </button>
      </header>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={lang === 'zh' ? '导航菜单' : 'Navigation menu'}>
          <button
            type="button"
            className="absolute inset-0 cursor-default bg-black/40"
            onClick={() => setMobileNavOpen(false)}
            aria-label={lang === 'zh' ? '关闭导航菜单' : 'Close navigation menu'}
          />
          <aside className="relative flex h-dvh w-[min(20rem,calc(100vw-2.5rem))] flex-col overflow-y-auto bg-gray-900 p-4 text-white shadow-2xl">
            <div className="mb-6 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold">{t('appName')}</h2>
                <p className="mt-2 truncate text-xs text-gray-400">{user.email}</p>
                <span className="mt-2 inline-flex rounded bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-200">
                  {roleLabel(lang, user.role)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-gray-800 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                aria-label={lang === 'zh' ? '关闭导航菜单' : 'Close navigation menu'}
              >
                <X className="h-6 w-6" aria-hidden="true" />
              </button>
            </div>
            <nav className="space-y-1">
              {navItems.map((item) => {
                const active = pathname === item.href
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={`block min-h-11 rounded px-3 py-2.5 transition-colors ${active ? 'bg-blue-600 text-white' : 'text-gray-100 hover:bg-gray-800'}`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>
            <div className="mt-6 border-t border-gray-800 pt-4">
              <LanguageToggle compact />
              <button
                onClick={() => logout()}
                className="mt-4 min-h-11 w-full rounded bg-gray-800 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-700"
              >
                {t('signOut')}
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      <aside className="hidden w-64 shrink-0 bg-gray-900 p-4 text-white lg:block">
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
      <main className="min-w-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mb-6 hidden justify-end lg:flex">
          <LanguageToggle />
        </div>
        {children}
      </main>
    </div>
  )
}

function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { lang, setLang, t } = useDashboardI18n()

  return (
    <div className={`inline-flex items-center gap-1 rounded-lg border p-1 text-sm shadow-sm ${compact ? 'w-full border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
      <span className={`px-2 ${compact ? 'text-gray-300' : 'text-gray-500'}`}>{t('language')}</span>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`min-h-9 rounded-md px-3 py-1.5 transition-colors ${lang === 'en' ? 'bg-blue-600 text-white' : compact ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
      >
        {t('english')}
      </button>
      <button
        type="button"
        onClick={() => setLang('zh')}
        className={`min-h-9 rounded-md px-3 py-1.5 transition-colors ${lang === 'zh' ? 'bg-blue-600 text-white' : compact ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
      >
        {t('chinese')}
      </button>
    </div>
  )
}
