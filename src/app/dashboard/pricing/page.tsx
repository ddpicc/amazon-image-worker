'use client'

import { useEffect, useState } from 'react'

interface PriceRow {
  id: string
  size: string
  price: number
  enabled: boolean
}

export default function PricingPage() {
  const [prices, setPrices] = useState<PriceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function loadPrices() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/v1/admin/pricing', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Failed to load pricing')
        return
      }
      setPrices(body.prices || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPrices()
  }, [])

  async function saveAll() {
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/v1/admin/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prices }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Failed to save pricing')
        return
      }
      setPrices(body.prices || [])
      setMessage('Pricing updated successfully')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-gray-500">Loading pricing...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Pricing</h2>
        <p className="text-sm text-gray-500 mt-1">Manage per-size pricing for image generation</p>
      </div>

      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{message}</div>}
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Size</th>
              <th className="px-4 py-3 text-left font-medium">Price (USD)</th>
              <th className="px-4 py-3 text-left font-medium">Enabled</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((row, index) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-medium text-gray-900">{row.size}</td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={row.price}
                    onChange={(e) => {
                      const value = Number(e.target.value)
                      setPrices((current) => current.map((item, i) => i === index ? { ...item, price: value } : item))
                    }}
                    className="w-40 px-3 py-2 border border-gray-300 rounded-md"
                  />
                </td>
                <td className="px-4 py-3">
                  <label className="inline-flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => {
                        const checked = e.target.checked
                        setPrices((current) => current.map((item, i) => i === index ? { ...item, enabled: checked } : item))
                      }}
                    />
                    <span className="text-gray-700">{row.enabled ? 'Enabled' : 'Disabled'}</span>
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button
        onClick={saveAll}
        disabled={saving}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? 'Saving...' : 'Save Pricing'}
      </button>
    </div>
  )
}
