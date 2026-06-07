'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated, logout } from '@/lib/dashboard/auth'
import { Activity, CheckCircle, Zap, Clock, AlertTriangle } from 'lucide-react'

interface OverviewData {
  totalTasks24h: number
  successRate: number
  activeProviders: number
  avgDurationMs: number
  recentFailures: RecentFailure[]
}

interface RecentFailure {
  id: string
  prompt: string
  providerName: string | null
  errorMessage: string | null
  createdAt: string
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
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/stats/overview')
      if (res.status === 401) {
        router.push('/dashboard/login')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError('')
    } catch {
      setError('Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/dashboard/login')
      return
    }
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  if (!data) return null

  const cards = [
    {
      title: 'Total Tasks (24h)',
      value: data.totalTasks24h.toLocaleString(),
      icon: Activity,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: 'Success Rate',
      value: `${data.successRate.toFixed(1)}%`,
      icon: CheckCircle,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      title: 'Active Providers',
      value: data.activeProviders.toString(),
      icon: Zap,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      title: 'Avg Duration',
      value: formatDuration(data.avgDurationMs),
      icon: Clock,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
        <button
          onClick={logout}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          Sign Out
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-lg shadow-sm border border-gray-200 bg-white p-4"
          >
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

      {/* Recent Failures */}
      <div className="rounded-lg shadow-sm border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <h3 className="font-semibold text-gray-900">Recent Failures</h3>
          <span className="text-xs text-gray-400 ml-auto">Last 10</span>
        </div>
        {data.recentFailures.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            No recent failures
          </div>
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
                {data.recentFailures.map((f, i) => (
                  <tr
                    key={f.id}
                    className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}
                  >
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">
                      {f.id.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2 text-gray-700 max-w-[200px] truncate">
                      {f.prompt}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {f.providerName || '-'}
                    </td>
                    <td className="px-4 py-2 text-red-600 max-w-[250px] truncate">
                      {f.errorMessage || 'Unknown error'}
                    </td>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                      {timeAgo(f.createdAt)}
                    </td>
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
