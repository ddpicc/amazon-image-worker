'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/dashboard/auth'
import { Plus, X, Copy, Trash2, Check } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKeyData {
  id: string
  name: string
  keyPrefix: string
  enabled: boolean
  quota: {
    dailyLimit: number | null
    monthlyLimit: number | null
    dailyUsed: number
    monthlyUsed: number
  } | null
  createdAt: string
}

interface AlertRuleData {
  id: string
  name: string
  conditionType: string
  providerId: string | null
  webhookUrl: string
  enabled: boolean
  lastTriggeredAt: string | null
  createdAt: string
}

interface AlertEventData {
  id: string
  ruleId: string
  ruleName?: string
  providerId: string | null
  providerName?: string
  message: string
  severity: 'WARNING' | 'CRITICAL'
  acknowledged: boolean
  createdAt: string
}

interface ProviderOption {
  id: string
  name: string
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls =
  'w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const btnPrimary =
  'px-4 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors'
const btnSecondary =
  'px-4 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors'

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  // Data
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([])
  const [alertRules, setAlertRules] = useState<AlertRuleData[]>([])
  const [alertEvents, setAlertEvents] = useState<AlertEventData[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>([])

  // UI state
  const [activeTab, setActiveTab] = useState<'keys' | 'rules' | 'events'>('keys')
  const [showCreateKey, setShowCreateKey] = useState(false)
  const [showAddRule, setShowAddRule] = useState(false)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [eventsFilter, setEventsFilter] = useState<'all' | 'unacked' | 'acked'>('all')
  const [copied, setCopied] = useState(false)

  // Forms
  const [keyForm, setKeyForm] = useState({ name: '', dailyLimit: '', monthlyLimit: '' })
  const [ruleForm, setRuleForm] = useState({
    name: '',
    conditionType: 'FAILURE_RATE',
    providerId: '',
    threshold: '{"threshold": 50}',
    webhookUrl: '',
  })

  const [submitting, setSubmitting] = useState(false)

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchAll = useCallback(async () => {
    try {
      const [keysRes, rulesRes, eventsRes, provRes] = await Promise.all([
        fetch('/api/v1/api-keys'),
        fetch('/api/v1/alerts/rules'),
        fetch('/api/v1/alerts/events'),
        fetch('/api/v1/providers'),
      ])

      if (keysRes.status === 401 || rulesRes.status === 401) {
        router.push('/dashboard/login')
        return
      }

      if (keysRes.ok) {
        const d = await keysRes.json()
        setApiKeys(Array.isArray(d) ? d : d.keys ?? [])
      }
      if (rulesRes.ok) {
        const d = await rulesRes.json()
        setAlertRules(Array.isArray(d) ? d : d.rules ?? [])
      }
      if (eventsRes.ok) {
        const d = await eventsRes.json()
        setAlertEvents(Array.isArray(d) ? d : d.events ?? [])
      }
      if (provRes.ok) {
        const d = await provRes.json()
        const raw = Array.isArray(d) ? d : d.providers ?? []
        setProviders(raw.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
      }
    } catch {
      // Silently fail — individual sections will show empty
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/dashboard/login')
      return
    }
    fetchAll()
  }, [fetchAll, router])

  // -----------------------------------------------------------------------
  // API Key actions
  // -----------------------------------------------------------------------

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyForm.name,
          dailyLimit: keyForm.dailyLimit ? Number(keyForm.dailyLimit) : null,
          monthlyLimit: keyForm.monthlyLimit ? Number(keyForm.monthlyLimit) : null,
        }),
      })
      if (res.ok) {
        const body = await res.json()
        setCreatedKey(body.key ?? body.apiKey ?? '')
        setShowCreateKey(false)
        setKeyForm({ name: '', dailyLimit: '', monthlyLimit: '' })
        await fetchAll()
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error || 'Failed to create key')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function revokeKey(id: string, name: string) {
    if (!confirm(`Revoke API key "${name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/v1/api-keys/${id}`, { method: 'DELETE' })
      if (res.ok) {
        await fetchAll()
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error || 'Failed to revoke key')
      }
    } catch {
      alert('Network error')
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // -----------------------------------------------------------------------
  // Alert Rule actions
  // -----------------------------------------------------------------------

  async function handleAddRule(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/alerts/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: ruleForm.name,
          conditionType: ruleForm.conditionType,
          providerId: ruleForm.providerId || null,
          threshold: JSON.parse(ruleForm.threshold),
          webhookUrl: ruleForm.webhookUrl,
        }),
      })
      if (res.ok) {
        setShowAddRule(false)
        setRuleForm({
          name: '',
          conditionType: 'FAILURE_RATE',
          providerId: '',
          threshold: '{"threshold": 50}',
          webhookUrl: '',
        })
        await fetchAll()
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error || 'Failed to create rule')
      }
    } catch {
      alert('Invalid threshold JSON')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleRule(rule: AlertRuleData) {
    try {
      const res = await fetch(`/api/v1/alerts/rules/${rule.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !rule.enabled }),
      })
      if (res.ok) await fetchAll()
    } catch {
      // ignore
    }
  }

  // -----------------------------------------------------------------------
  // Alert Event actions
  // -----------------------------------------------------------------------

  async function acknowledgeEvent(id: string) {
    try {
      const res = await fetch(`/api/v1/alerts/events/${id}/acknowledge`, { method: 'POST' })
      if (res.ok) await fetchAll()
    } catch {
      // ignore
    }
  }

  // -----------------------------------------------------------------------
  // Filter events
  // -----------------------------------------------------------------------

  const filteredEvents = alertEvents.filter((e) => {
    if (eventsFilter === 'unacked') return !e.acknowledged
    if (eventsFilter === 'acked') return e.acknowledged
    return true
  })

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Settings</h2>

      {/* Created key banner */}
      {createdKey && (
        <div className="mb-6 rounded-lg shadow-sm border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-green-900">API Key Created</h4>
            <button onClick={() => setCreatedKey(null)} className="text-green-600 hover:text-green-800">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-green-700 mb-2">
            Copy this key now. It will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-green-300 rounded px-3 py-2 text-sm font-mono text-gray-900 break-all">
              {createdKey}
            </code>
            <button
              onClick={() => copyKey(createdKey)}
              className="p-2 bg-white border border-green-300 rounded hover:bg-green-100 text-green-700 shrink-0"
              title="Copy"
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6">
        {(
          [
            ['keys', 'API Keys'],
            ['rules', 'Alert Rules'],
            ['events', 'Alert Events'],
          ] as const
        ).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setActiveTab(val)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              activeTab === val
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ===== API Keys section ===== */}
      {activeTab === 'keys' && (
        <div>
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={() => setShowCreateKey(true)}
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Create Key
            </button>
          </div>

          <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Prefix</th>
                    <th className="px-4 py-2.5 font-medium">Enabled</th>
                    <th className="px-4 py-2.5 font-medium">Daily Limit</th>
                    <th className="px-4 py-2.5 font-medium">Monthly Limit</th>
                    <th className="px-4 py-2.5 font-medium">Daily Used</th>
                    <th className="px-4 py-2.5 font-medium">Monthly Used</th>
                    <th className="px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                        No API keys
                      </td>
                    </tr>
                  ) : (
                    apiKeys.map((k, i) => (
                      <tr
                        key={k.id}
                        className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-900">{k.name}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                          {k.keyPrefix}...
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              k.enabled
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {k.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {k.quota?.dailyLimit ?? 'Unlimited'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {k.quota?.monthlyLimit ?? 'Unlimited'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">{k.quota?.dailyUsed ?? 0}</td>
                        <td className="px-4 py-2.5 text-gray-600">{k.quota?.monthlyUsed ?? 0}</td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => revokeKey(k.id, k.name)}
                            className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== Alert Rules section ===== */}
      {activeTab === 'rules' && (
        <div>
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={() => setShowAddRule(true)}
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Add Rule
            </button>
          </div>

          <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    <th className="px-4 py-2.5 font-medium">Condition</th>
                    <th className="px-4 py-2.5 font-medium">Provider</th>
                    <th className="px-4 py-2.5 font-medium">Webhook URL</th>
                    <th className="px-4 py-2.5 font-medium">Enabled</th>
                    <th className="px-4 py-2.5 font-medium">Last Triggered</th>
                    <th className="px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {alertRules.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                        No alert rules
                      </td>
                    </tr>
                  ) : (
                    alertRules.map((r, i) => (
                      <tr
                        key={r.id}
                        className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}
                      >
                        <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{r.conditionType}</td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {providers.find((p) => p.id === r.providerId)?.name || 'All'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-[200px] truncate">
                          {r.webhookUrl}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => toggleRule(r)}
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              r.enabled
                                ? 'bg-green-100 text-green-800 hover:bg-green-200'
                                : 'bg-red-100 text-red-800 hover:bg-red-200'
                            }`}
                          >
                            {r.enabled ? 'Enabled' : 'Disabled'}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                          {r.lastTriggeredAt
                            ? new Date(r.lastTriggeredAt).toLocaleString()
                            : 'Never'}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => {
                              if (!confirm(`Delete rule "${r.name}"?`)) return
                              fetch(`/api/v1/alerts/rules/${r.id}`, { method: 'DELETE' }).then(
                                (res) => {
                                  if (res.ok) fetchAll()
                                },
                              )
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== Alert Events section ===== */}
      {activeTab === 'events' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            {(
              [
                ['all', 'All'],
                ['unacked', 'Unacknowledged'],
                ['acked', 'Acknowledged'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setEventsFilter(val)}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  eventsFilter === val
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2.5 font-medium">Time</th>
                    <th className="px-4 py-2.5 font-medium">Rule</th>
                    <th className="px-4 py-2.5 font-medium">Provider</th>
                    <th className="px-4 py-2.5 font-medium">Message</th>
                    <th className="px-4 py-2.5 font-medium">Severity</th>
                    <th className="px-4 py-2.5 font-medium">Acknowledged</th>
                    <th className="px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEvents.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                        No alert events
                      </td>
                    </tr>
                  ) : (
                    filteredEvents.map((ev, i) => (
                      <tr
                        key={ev.id}
                        className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}
                      >
                        <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                          {new Date(ev.createdAt).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">
                          {ev.ruleName || ev.ruleId.slice(0, 8)}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600">
                          {ev.providerName || ev.providerId?.slice(0, 8) || 'All'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 max-w-[300px] truncate">
                          {ev.message}
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              ev.severity === 'CRITICAL'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {ev.severity}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          {ev.acknowledged ? (
                            <span className="text-green-700 text-xs">Yes</span>
                          ) : (
                            <span className="text-gray-400 text-xs">No</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {!ev.acknowledged && (
                            <button
                              onClick={() => acknowledgeEvent(ev.id)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              Acknowledge
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===== Create Key Modal ===== */}
      {showCreateKey && (
        <Modal title="Create API Key" onClose={() => setShowCreateKey(false)}>
          <form onSubmit={handleCreateKey} className="space-y-3">
            <Field label="Name">
              <input
                type="text"
                value={keyForm.name}
                onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })}
                className={inputCls}
                required
                placeholder="e.g. Production App"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Daily Limit (optional)">
                <input
                  type="number"
                  value={keyForm.dailyLimit}
                  onChange={(e) => setKeyForm({ ...keyForm, dailyLimit: e.target.value })}
                  className={inputCls}
                  placeholder="Unlimited"
                />
              </Field>
              <Field label="Monthly Limit (optional)">
                <input
                  type="number"
                  value={keyForm.monthlyLimit}
                  onChange={(e) => setKeyForm({ ...keyForm, monthlyLimit: e.target.value })}
                  className={inputCls}
                  placeholder="Unlimited"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCreateKey(false)} className={btnSecondary}>
                Cancel
              </button>
              <button type="submit" disabled={submitting} className={btnPrimary}>
                {submitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ===== Add Alert Rule Modal ===== */}
      {showAddRule && (
        <Modal title="Add Alert Rule" onClose={() => setShowAddRule(false)}>
          <form onSubmit={handleAddRule} className="space-y-3">
            <Field label="Name">
              <input
                type="text"
                value={ruleForm.name}
                onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                className={inputCls}
                required
              />
            </Field>
            <Field label="Condition Type">
              <select
                value={ruleForm.conditionType}
                onChange={(e) => setRuleForm({ ...ruleForm, conditionType: e.target.value })}
                className={inputCls}
              >
                <option value="CIRCUIT_BREAKER">Circuit Breaker</option>
                <option value="FAILURE_RATE">Failure Rate</option>
                <option value="LATENCY_THRESHOLD">Latency Threshold</option>
                <option value="PROVIDER_DOWN">Provider Down</option>
              </select>
            </Field>
            <Field label="Provider (optional)">
              <select
                value={ruleForm.providerId}
                onChange={(e) => setRuleForm({ ...ruleForm, providerId: e.target.value })}
                className={inputCls}
              >
                <option value="">All Providers</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Threshold (JSON)">
              <input
                type="text"
                value={ruleForm.threshold}
                onChange={(e) => setRuleForm({ ...ruleForm, threshold: e.target.value })}
                className={inputCls}
                placeholder='{"threshold": 50}'
              />
            </Field>
            <Field label="Webhook URL">
              <input
                type="url"
                value={ruleForm.webhookUrl}
                onChange={(e) => setRuleForm({ ...ruleForm, webhookUrl: e.target.value })}
                className={inputCls}
                required
                placeholder="https://hooks.example.com/..."
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddRule(false)} className={btnSecondary}>
                Cancel
              </button>
              <button type="submit" disabled={submitting} className={btnPrimary}>
                {submitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
