'use client'

import { useEffect, useState } from 'react'
import { useDashboardI18n } from '@/lib/dashboard/i18n'

interface PriceRow {
  id: string
  sku: string
  label: string
  price: number
  version: number
  enabled: boolean
}

export default function PricingPage() {
  const { lang, t } = useDashboardI18n()
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
        setError(body.error || (lang === 'zh' ? '加载定价失败' : 'Failed to load pricing'))
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
        setError(body.error || (lang === 'zh' ? '保存定价失败' : 'Failed to save pricing'))
        return
      }
      setPrices(body.prices || [])
      setMessage(lang === 'zh' ? '定价已更新' : 'Pricing updated successfully')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-gray-500">{lang === 'zh' ? '正在加载定价...' : 'Loading pricing...'}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('navPricing')}</h2>
        <p className="text-sm text-gray-500 mt-1">{lang === 'zh' ? '管理生图和编辑任务的 CNY SKU 定价' : 'Manage SKU pricing for image generation and editing in CNY'}</p>
      </div>

      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{message}</div>}
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">SKU</th>
              <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '标签' : 'Label'}</th>
              <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '价格（CNY）' : 'Price (CNY)'}</th>
              <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '版本' : 'Version'}</th>
              <th className="px-4 py-3 text-left font-medium">{t('enabled')}</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((row, index) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900">{row.sku}</td>
                <td className="px-4 py-3 text-gray-700">{row.label}</td>
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
                <td className="px-4 py-3 text-gray-700">v{row.version}</td>
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
                    <span className="text-gray-700">{row.enabled ? t('enabled') : t('disabled')}</span>
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
        {saving ? t('saving') : (lang === 'zh' ? '保存定价' : 'Save Pricing')}
      </button>
    </div>
  )
}
