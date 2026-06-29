'use client'

import { useEffect, useMemo, useState } from 'react'

interface UsageRow {
  id: string
  prompt: string
  size: string | null
  pricingSku: string | null
  unitPrice: number | null
  priceVersion: number | null
  cost: number | null
  costStatus: string | null
  status: string
  createdAt: string
  apiKeyId: string
  apiKeyName: string
}

interface ApiKeyOption {
  id: string
  name: string
  keyPrefix: string
}

export default function UsagePage() {
  const [records, setRecords] = useState<UsageRow[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKeyOption[]>([])
  const [selectedApiKeyId, setSelectedApiKeyId] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const usageParams = new URLSearchParams({ limit: '100' })
        if (selectedApiKeyId !== 'ALL') {
          usageParams.set('apiKeyId', selectedApiKeyId)
        }

        const [usageRes, keysRes] = await Promise.all([
          fetch(`/api/v1/usage?${usageParams.toString()}`, { cache: 'no-store' }),
          fetch('/api/v1/api-keys', { cache: 'no-store' }),
        ])

        const usageBody = await usageRes.json().catch(() => ({}))
        const keysBody = await keysRes.json().catch(() => ({}))
        if (!usageRes.ok) {
          setError(usageBody.error || 'Failed to load usage')
          return
        }
        if (!keysRes.ok) {
          setError(keysBody.error || 'Failed to load API keys')
          return
        }

        setRecords(usageBody.records || [])
        setApiKeys(keysBody.keys || [])
        setError('')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [selectedApiKeyId])

  const totalCharged = useMemo(
    () => records
      .filter((row) => row.costStatus === 'CHARGED' && row.cost !== null)
      .reduce((sum, row) => sum + (row.cost ?? 0), 0),
    [records],
  )

  const totalRefunded = useMemo(
    () => records
      .filter((row) => row.costStatus === 'REFUNDED' && row.cost !== null)
      .reduce((sum, row) => sum + (row.cost ?? 0), 0),
    [records],
  )

  const perKeySummary = useMemo(() => {
    const summary = new Map<string, { apiKeyName: string; charged: number; refunded: number; count: number }>()
    for (const row of records) {
      const current = summary.get(row.apiKeyId) ?? {
        apiKeyName: row.apiKeyName,
        charged: 0,
        refunded: 0,
        count: 0,
      }
      current.count += 1
      if (row.cost !== null) {
        if (row.costStatus === 'CHARGED') current.charged += row.cost
        if (row.costStatus === 'REFUNDED') current.refunded += row.cost
      }
      summary.set(row.apiKeyId, current)
    }
    return Array.from(summary.entries()).map(([apiKeyId, value]) => ({ apiKeyId, ...value }))
  }, [records])

  if (loading) {
    return <div className="text-gray-500">Loading usage...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Usage</h2>
        <p className="text-sm text-gray-500 mt-1">Review your billed image generation history by API key</p>
      </div>

      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
            <select
              value={selectedApiKeyId}
              onChange={(e) => setSelectedApiKeyId(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="ALL">All API Keys</option>
              {apiKeys.map((key) => (
                <option key={key.id} value={key.id}>
                  {key.name} ({key.keyPrefix}...)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Charged</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">¥{totalCharged.toFixed(2)}</p>
            </div>
            <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Refunded</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">¥{totalRefunded.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {selectedApiKeyId === 'ALL' && perKeySummary.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-200 px-4 py-3">
            <h3 className="font-medium text-gray-900">API Key Spend Summary</h3>
          </div>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-700">
              <tr>
                <th className="px-4 py-3 text-left font-medium">API Key</th>
                <th className="px-4 py-3 text-left font-medium">Tasks</th>
                <th className="px-4 py-3 text-left font-medium">Charged</th>
                <th className="px-4 py-3 text-left font-medium">Refunded</th>
              </tr>
            </thead>
            <tbody>
              {perKeySummary.map((row) => (
                <tr key={row.apiKeyId} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-900">{row.apiKeyName}</td>
                  <td className="px-4 py-3 text-gray-700">{row.count}</td>
                  <td className="px-4 py-3 text-gray-900">¥{row.charged.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-700">¥{row.refunded.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium">API Key</th>
              <th className="px-4 py-3 text-left font-medium">Prompt</th>
              <th className="px-4 py-3 text-left font-medium">Size</th>
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">Unit Price</th>
              <th className="px-4 py-3 text-left font-medium">Cost</th>
              <th className="px-4 py-3 text-left font-medium">Cost Status</th>
              <th className="px-4 py-3 text-left font-medium">Task Status</th>
            </tr>
          </thead>
          <tbody>
            {records.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-700">{new Date(row.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-900">{row.apiKeyName}</td>
                <td className="px-4 py-3 text-gray-900 max-w-xl truncate" title={row.prompt}>{row.prompt}</td>
                <td className="px-4 py-3 text-gray-700">{row.size || '-'}</td>
                <td className="px-4 py-3 text-gray-700">{row.pricingSku || '-'}{row.priceVersion ? ` v${row.priceVersion}` : ''}</td>
                <td className="px-4 py-3 text-gray-900">{row.unitPrice !== null ? `¥${row.unitPrice.toFixed(2)}` : '-'}</td>
                <td className="px-4 py-3 text-gray-900">{row.cost !== null ? `¥${row.cost.toFixed(2)}` : '-'}</td>
                <td className="px-4 py-3 text-gray-700">{row.costStatus || '-'}</td>
                <td className="px-4 py-3 text-gray-700">{row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
