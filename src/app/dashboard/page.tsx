'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'
import { Activity, CheckCircle, Zap, Clock, AlertTriangle, KeyRound } from 'lucide-react'

interface RecentFailure {
  id: string
  prompt: string
  providerName: string | null
  errorMessage: string | null
  createdAt: string
}

interface AdminOverviewData {
  totalTasks24h: number
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

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function DashboardOverview() {
  const router = useRouter()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [adminData, setAdminData] = useState<AdminOverviewData | null>(null)
  const [userData, setUserData] = useState<UserOverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async (currentUser: DashboardUser) => {
    try {
      if (currentUser.role === 'ADMIN') {
        const res = await fetch('/api/v1/stats/overview')
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        setAdminData(json)
        setUserData(null)
      } else {
        const [tasksRes, keysRes] = await Promise.all([
          fetch('/api/v1/tasks?page=1&limit=20'),
          fetch('/api/v1/api-keys'),
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
          .map((t: { id: string; prompt: string; selectedProviderName: string | null; errorMessage: string | null; createdAt: string }) => ({
            id: t.id,
            prompt: t.prompt,
            providerName: t.selectedProviderName,
            errorMessage: t.errorMessage,
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
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Loading...</div></div>
  }

  if (error || !user) {
    return <div className="flex items-center justify-center h-64"><div className="text-red-600">{error || 'Unauthorized'}</div></div>
  }

  const isAdmin = user.role === 'ADMIN'
  const overview = isAdmin ? adminData : userData
  if (!overview) return null

  const cards = isAdmin
    ? [
        { title: 'Total Tasks (24h)', value: overview.totalTasks24h.toLocaleString(), icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50' },
        { title: 'Success Rate', value: `${overview.successRate.toFixed(1)}%`, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
        { title: 'Active Providers', value: (overview as AdminOverviewData).activeProviders.toString(), icon: Zap, color: 'text-purple-600', bg: 'bg-purple-50' },
        { title: 'Avg Duration', value: formatDuration(overview.avgDurationMs), icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
      ]
    : [
        { title: 'My Tasks (24h)', value: overview.totalTasks24h.toLocaleString(), icon: Activity, color: 'text-blue-600', bg: 'bg-blue-50' },
        { title: 'My Success Rate', value: `${overview.successRate.toFixed(1)}%`, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
        { title: 'My API Keys', value: (overview as UserOverviewData).apiKeyCount.toString(), icon: KeyRound, color: 'text-purple-600', bg: 'bg-purple-50' },
        { title: 'Avg Duration', value: formatDuration(overview.avgDurationMs), icon: Clock, color: 'text-orange-600', bg: 'bg-orange-50' },
      ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
          <p className="text-sm text-gray-500 mt-1">{isAdmin ? 'System-wide operational overview' : 'Your account activity overview'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div key={card.title} className="rounded-lg shadow-sm border border-gray-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{card.title}</p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">{card.value}</p>
              </div>
              <div className={`${card.bg} p-3 rounded-lg`}>
                <card.icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-lg shadow-sm border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h3 className="font-semibold text-gray-900">Recent Failures</h3>
          <span className="text-xs text-gray-400 ml-auto">Last 10</span>
        </div>
        {overview.recentFailures.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No recent failures</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">ID</th>
                  <th className="px-4 py-2 font-medium">Prompt</th>
                  <th className="px-4 py-2 font-medium">Provider</th>
                  <th className="px-4 py-2 font-medium">Error</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {overview.recentFailures.map((f, i) => (
                  <tr key={f.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">{f.id.slice(0, 8)}</td>
                    <td className="px-4 py-2 text-gray-700 max-w-[200px] truncate">{f.prompt}</td>
                    <td className="px-4 py-2 text-gray-600">{f.providerName || '-'}</td>
                    <td className="px-4 py-2 text-red-600 max-w-[250px] truncate">{f.errorMessage || 'Unknown error'}</td>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{timeAgo(f.createdAt)}</td>
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
