'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'
import { Activity, CheckCircle, Zap, Clock, AlertTriangle, KeyRound, CalendarDays, Server } from 'lucide-react'
import { useDashboardI18n } from '@/lib/dashboard/i18n'

interface RecentFailure {
  id: string
  prompt?: string
  providerName?: string | null
  errorMessage?: string | null
  createdAt: string
  durationMs?: number | null
}

interface AdminOverviewData {
  totalTasks24h: number
  totalTasks7d: number
  totalTasks30d: number
  successRate: number
  activeProviders: number
  avgDurationMs: number
  recentFailures: RecentFailure[]
}

interface UserOverviewData {
  totalTasks24h: number
  successRate: number
  apiKeyCount: number
  avgDurationMs: number
  recentFailures: RecentFailure[]
}

interface ProviderSummary {
  id: string
  name: string
  vendor: string
  enabled: boolean
  totalAttempts: number
  successfulAttempts: number
  avgDurationMs: number
  circuitBreakerTrippedAt: string | null
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function timeAgo(
  dateStr: string,
  labels: { justNow: string; minutesAgo: string; hoursAgo: string; daysAgo: string },
  lang: 'en' | 'zh',
): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return labels.justNow
  if (mins < 60) return lang === 'zh' ? `${mins}${labels.minutesAgo}` : `${mins}${labels.minutesAgo}`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return lang === 'zh' ? `${hours}${labels.hoursAgo}` : `${hours}${labels.hoursAgo}`
  return lang === 'zh' ? `${Math.floor(hours / 24)}${labels.daysAgo}` : `${Math.floor(hours / 24)}${labels.daysAgo}`
}

function providerSuccessRate(provider: ProviderSummary) {
  if (provider.totalAttempts === 0) return 0
  return Number(((provider.successfulAttempts / provider.totalAttempts) * 100).toFixed(1))
}

export default function DashboardOverview() {
  const router = useRouter()
  const { lang, t } = useDashboardI18n()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [adminData, setAdminData] = useState<AdminOverviewData | null>(null)
  const [userData, setUserData] = useState<UserOverviewData | null>(null)
  const [providers, setProviders] = useState<ProviderSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async (currentUser: DashboardUser) => {
    try {
      if (currentUser.role === 'ADMIN') {
        const [overviewRes, providersRes] = await Promise.all([
          fetch('/api/v1/stats/overview', { credentials: 'include' }),
          fetch('/api/v1/providers', { credentials: 'include' }),
        ])
        if (!overviewRes.ok || !providersRes.ok) throw new Error('Failed to load admin overview')

        const overviewJson = await overviewRes.json()
        const providersJson = await providersRes.json()
        setAdminData(overviewJson)
        setProviders(providersJson.data ?? providersJson.providers ?? [])
        setUserData(null)
      } else {
        const [tasksRes, keysRes] = await Promise.all([
          fetch('/api/v1/tasks?page=1&limit=20', { credentials: 'include' }),
          fetch('/api/v1/api-keys', { credentials: 'include' }),
        ])
        if (!tasksRes.ok || !keysRes.ok) throw new Error('Failed to load user data')

        const tasksJson = await tasksRes.json()
        const keysJson = await keysRes.json()
        const tasks = tasksJson.tasks ?? []
        const keys = keysJson.keys ?? []
        const completed = tasks.filter((t: { status: string }) => t.status === 'SUCCEEDED' || t.status === 'FAILED')
        const succeeded = tasks.filter((t: { status: string }) => t.status === 'SUCCEEDED')
        const recentFailures = tasks
          .filter((t: { status: string }) => t.status === 'FAILED')
          .slice(0, 10)
          .map((t: { id: string; createdAt: string }) => ({
            id: t.id,
            createdAt: t.createdAt,
          }))
        const durationTasks = tasks.filter((t: { durationMs: number | null }) => typeof t.durationMs === 'number')
        const avgDurationMs = durationTasks.reduce((sum: number, t: { durationMs: number | null }) => sum + (t.durationMs ?? 0), 0) /
          Math.max(1, durationTasks.length)

        setUserData({
          totalTasks24h: tasks.length,
          successRate: completed.length ? Number(((succeeded.length / completed.length) * 100).toFixed(1)) : 0,
          apiKeyCount: keys.length,
          avgDurationMs: Math.round(avgDurationMs || 0),
          recentFailures,
        })
        setAdminData(null)
        setProviders([])
      }
      setError('')
    } catch {
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    fetchCurrentUser().then((u) => {
      if (!mounted) return
      if (!u) {
        router.push('/dashboard/login')
        return
      }
      setUser(u)
      fetchData(u)
    })
    return () => {
      mounted = false
    }
  }, [fetchData, router])

  if (loading) {
    return <div className="flex h-64 items-center justify-center"><div className="text-gray-500">{t('loading')}</div></div>
  }

  if (error || !user) {
    return <div className="flex h-64 items-center justify-center"><div className="text-red-600">{error || 'Unauthorized'}</div></div>
  }

  const isAdmin = user.role === 'ADMIN'
  const overview = isAdmin ? adminData : userData
  if (!overview) return null

  const providerHealth = providers
    .slice()
    .sort((a, b) => {
      if (!!a.circuitBreakerTrippedAt !== !!b.circuitBreakerTrippedAt) {
        return a.circuitBreakerTrippedAt ? -1 : 1
      }
      return providerSuccessRate(a) - providerSuccessRate(b)
    })
    .slice(0, 5)

  const cards = isAdmin
    ? [
        { title: t('tasks24h'), value: overview.totalTasks24h.toLocaleString(), icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50' },
        { title: t('tasks7d'), value: (overview as AdminOverviewData).totalTasks7d.toLocaleString(), icon: CalendarDays, color: 'text-indigo-600', bg: 'bg-indigo-50' },
        { title: t('tasks30d'), value: (overview as AdminOverviewData).totalTasks30d.toLocaleString(), icon: CalendarDays, color: 'text-purple-600', bg: 'bg-purple-50' },
        { title: t('successRate'), value: `${overview.successRate.toFixed(1)}%`, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
        { title: t('activeProviders'), value: (overview as AdminOverviewData).activeProviders.toString(), icon: Server, color: 'text-cyan-600', bg: 'bg-cyan-50' },
        { title: t('avgDuration'), value: formatDuration(overview.avgDurationMs), icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
      ]
    : [
        { title: t('myTasks24h'), value: overview.totalTasks24h.toLocaleString(), icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50' },
        { title: t('mySuccessRate'), value: `${overview.successRate.toFixed(1)}%`, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
        { title: t('myApiKeys'), value: (overview as UserOverviewData).apiKeyCount.toString(), icon: KeyRound, color: 'text-purple-600', bg: 'bg-purple-50' },
        { title: t('avgDuration'), value: formatDuration(overview.avgDurationMs), icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
      ]

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{t('overviewTitle')}</h2>
          <p className="mt-1 text-sm text-gray-500">{isAdmin ? t('overviewAdminSubtitle') : t('overviewUserSubtitle')}</p>
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${isAdmin ? 'sm:grid-cols-2 xl:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4'}`}>
        {cards.map((card) => (
          <div key={card.title} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.title}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">{card.value}</p>
              </div>
              <div className={`${card.bg} rounded-lg p-3`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {isAdmin && providerHealth.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 px-4 py-3 flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-500" />
            <h3 className="font-semibold text-gray-900">{t('providerHealthSnapshot')}</h3>
            <span className="ml-auto text-xs text-gray-400">{t('top5ByRisk')}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2.5 font-medium">{t('provider')}</th>
                <th className="px-4 py-2.5 font-medium">{t('vendor')}</th>
                <th className="px-4 py-2.5 font-medium">{t('status')}</th>
                <th className="px-4 py-2.5 font-medium">{t('successRate')}</th>
                <th className="px-4 py-2.5 font-medium">{t('avgDuration')}</th>
                <th className="px-4 py-2.5 font-medium">{t('attempts')}</th>
              </tr>
            </thead>
            <tbody>
              {providerHealth.map((provider, index) => (
                <tr key={provider.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{provider.name}</td>
                  <td className="px-4 py-2.5 text-gray-600">{provider.vendor}</td>
                  <td className="px-4 py-2.5">
                    {provider.circuitBreakerTrippedAt ? (
                      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800">{t('tripped')}</span>
                    ) : provider.enabled ? (
                      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800">{t('enabled')}</span>
                    ) : (
                      <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800">{t('disabled')}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">{provider.totalAttempts > 0 ? `${providerSuccessRate(provider)}%` : t('na')}</td>
                  <td className="px-4 py-2.5 text-gray-600">{provider.avgDurationMs > 0 ? formatDuration(provider.avgDurationMs) : t('na')}</td>
                  <td className="px-4 py-2.5 text-gray-600">{provider.totalAttempts.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-200 px-4 py-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <h3 className="font-semibold text-gray-900">{isAdmin ? t('recentFailures') : t('recentFailedTasks')}</h3>
          <span className="ml-auto text-xs text-gray-400">{t('last10')}</span>
        </div>
        {overview.recentFailures.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">{t('noRecentFailures')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">ID</th>
                  {isAdmin ? <th className="px-4 py-2 font-medium">{t('prompt')}</th> : null}
                  {isAdmin ? <th className="px-4 py-2 font-medium">{t('provider')}</th> : null}
                  <th className="px-4 py-2 font-medium">{t('error')}</th>
                  {isAdmin ? <th className="px-4 py-2 font-medium">{t('duration')}</th> : null}
                  <th className="px-4 py-2 font-medium">{t('time')}</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentFailures.map((failure, index) => (
                  <tr key={failure.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">{failure.id.slice(0, 8)}</td>
                    {isAdmin ? <td className="px-4 py-2 text-gray-700 max-w-[220px] truncate">{failure.prompt}</td> : null}
                    {isAdmin ? <td className="px-4 py-2 text-gray-600">{failure.providerName || '-'}</td> : null}
                    <td className="px-4 py-2 text-red-600 max-w-[280px] truncate">{failure.errorMessage || t('taskFailed')}</td>
                    {isAdmin ? <td className="px-4 py-2 text-gray-600">{failure.durationMs != null ? formatDuration(failure.durationMs) : '-'}</td> : null}
                    <td className="px-4 py-2 whitespace-nowrap text-gray-500">{timeAgo(failure.createdAt, {
                      justNow: t('justNow'),
                      minutesAgo: t('minutesAgo'),
                      hoursAgo: t('hoursAgo'),
                      daysAgo: t('daysAgo'),
                    }, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
