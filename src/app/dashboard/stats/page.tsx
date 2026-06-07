'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/dashboard/auth'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface Provider {
  id: string
  name: string
  vendor: string
  enabled: boolean
  totalAttempts: number
  successfulAttempts: number
  avgDurationMs: number
  estimatedCostPerReq: number
  circuitBreakerTrippedAt: string | null
}

interface ProviderStats {
  name: string
  vendor: string
  enabled: boolean
  totalAttempts: number
  successfulAttempts: number
  successRate: number
  avgDurationMs: number
  costPerReq: number
  tripped: boolean
}

const CHART_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#6366f1',
]

export default function StatsPage() {
  const router = useRouter()
  const [providers, setProviders] = useState<ProviderStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/providers')
      if (res.status === 401) {
        router.push('/dashboard/login')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const raw: Provider[] = Array.isArray(json) ? json : json.providers ?? []
      const stats: ProviderStats[] = raw.map((p) => ({
        name: p.name,
        vendor: p.vendor,
        enabled: p.enabled,
        totalAttempts: p.totalAttempts,
        successfulAttempts: p.successfulAttempts,
        successRate:
          p.totalAttempts > 0
            ? Math.round((p.successfulAttempts / p.totalAttempts) * 1000) / 10
            : 0,
        avgDurationMs: p.avgDurationMs,
        costPerReq: p.estimatedCostPerReq,
        tripped: !!p.circuitBreakerTrippedAt,
      }))
      setProviders(stats)
      setError('')
    } catch {
      setError('Failed to load statistics')
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
  }, [fetchData, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading statistics...</div>
      </div>
    )
  }

  if (error && providers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  const successData = providers.map((p) => ({
    name: p.name,
    rate: p.successRate,
  }))

  const latencyData = providers.map((p) => ({
    name: p.name,
    latency: p.avgDurationMs,
  }))

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Statistics</h2>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Success Rate Chart */}
        <div className="rounded-lg shadow-sm border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Provider Success Rate (%)</h3>
          {providers.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              No provider data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, providers.length * 40 + 40)}>
              <BarChart data={successData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={((value: number | string) => [`${value}%`, 'Success Rate']) as never}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="rate" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {successData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Avg Latency Chart */}
        <div className="rounded-lg shadow-sm border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Provider Avg Latency (ms)</h3>
          {providers.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">
              No provider data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(200, providers.length * 40 + 40)}>
              <BarChart data={latencyData} layout="vertical" margin={{ left: 10, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  formatter={((value: number | string) => [`${value}ms`, 'Avg Latency']) as never}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="latency" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {latencyData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Summary table */}
      <div className="rounded-lg shadow-sm border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Provider Metrics Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2.5 font-medium">Provider</th>
                <th className="px-4 py-2.5 font-medium">Vendor</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Total Attempts</th>
                <th className="px-4 py-2.5 font-medium">Successful</th>
                <th className="px-4 py-2.5 font-medium">Success Rate</th>
                <th className="px-4 py-2.5 font-medium">Avg Latency</th>
                <th className="px-4 py-2.5 font-medium">Cost/Req</th>
              </tr>
            </thead>
            <tbody>
              {providers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                    No providers found
                  </td>
                </tr>
              ) : (
                providers.map((p, i) => (
                  <tr
                    key={p.name}
                    className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.vendor}</td>
                    <td className="px-4 py-2.5">
                      {p.tripped ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          TRIPPED
                        </span>
                      ) : p.enabled ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                          Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">{p.totalAttempts.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-gray-600">{p.successfulAttempts.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {p.totalAttempts > 0 ? (
                        <span
                          className={
                            p.successRate >= 95
                              ? 'text-green-700'
                              : p.successRate >= 80
                                ? 'text-yellow-700'
                                : 'text-red-700'
                          }
                        >
                          {p.successRate}%
                        </span>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">
                      {p.avgDurationMs > 0 ? `${p.avgDurationMs}ms` : 'N/A'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-600">${p.costPerReq.toFixed(4)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
