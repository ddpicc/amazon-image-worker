'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'
import { Plus, X, Copy, Trash2, Check, Pencil, RotateCcw, Power, PowerOff } from 'lucide-react'

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
  ownerUser?: { id: string; email: string; name: string | null; role: 'ADMIN' | 'USER' }
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

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>{children}</div>
}

const inputCls = 'w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'
const btnPrimary = 'px-4 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors'
const btnSecondary = 'px-4 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors'

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([])
  const [alertRules, setAlertRules] = useState<AlertRuleData[]>([])
  const [alertEvents, setAlertEvents] = useState<AlertEventData[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [activeTab, setActiveTab] = useState<'keys' | 'rules' | 'events'>('keys')
  const [showCreateKey, setShowCreateKey] = useState(false)
  const [showAddRule, setShowAddRule] = useState(false)
  const [editKey, setEditKey] = useState<ApiKeyData | null>(null)
  const [createdKey, setCreatedKey] = useState<string | null>(null)
  const [eventsFilter, setEventsFilter] = useState<'all' | 'unacked' | 'acked'>('all')
  const [copied, setCopied] = useState(false)
  const [keyForm, setKeyForm] = useState({ name: '' })
  const [editKeyName, setEditKeyName] = useState('')
  const [ruleForm, setRuleForm] = useState({ name: '', conditionType: 'FAILURE_RATE', providerId: '', threshold: '{"threshold": 50}', webhookUrl: '' })
  const [submitting, setSubmitting] = useState(false)
  const [keyActionLoading, setKeyActionLoading] = useState<string | null>(null)

  const fetchAll = useCallback(async (currentUser: DashboardUser) => {
    try {
      const requests: Promise<Response>[] = [fetch('/api/v1/api-keys')]
      if (currentUser.role === 'ADMIN') {
        requests.push(fetch('/api/v1/alerts/rules'), fetch('/api/v1/alerts/events'), fetch('/api/v1/providers'))
      }

      const responses = await Promise.all(requests)
      const [keysRes, rulesRes, eventsRes, provRes] = responses

      if (keysRes?.ok) {
        const d = await keysRes.json()
        setApiKeys(Array.isArray(d) ? d : d.keys ?? d.data ?? [])
      }
      if (currentUser.role === 'ADMIN' && rulesRes?.ok) {
        const d = await rulesRes.json()
        setAlertRules(Array.isArray(d) ? d : d.rules ?? d.data ?? [])
      } else {
        setAlertRules([])
      }
      if (currentUser.role === 'ADMIN' && eventsRes?.ok) {
        const d = await eventsRes.json()
        const raw = Array.isArray(d) ? d : d.events ?? d.data ?? []
        setAlertEvents(raw.map((ev: { id: string; ruleId: string; providerId: string | null; message: string; severity: 'WARNING' | 'CRITICAL'; acknowledged: boolean; createdAt: string; rule?: { name?: string }; provider?: { name?: string } }) => ({ ...ev, ruleName: ev.rule?.name, providerName: ev.provider?.name })))
      } else {
        setAlertEvents([])
      }
      if (currentUser.role === 'ADMIN' && provRes?.ok) {
        const d = await provRes.json()
        const raw = Array.isArray(d) ? d : d.providers ?? d.data ?? []
        setProviders(raw.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
      } else {
        setProviders([])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchCurrentUser().then((u) => {
      if (!u) {
        router.push('/dashboard/login')
        return
      }
      setUser(u)
      fetchAll(u)
    })
  }, [fetchAll, router])

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: keyForm.name }),
      })
      if (res.ok) {
        const body = await res.json()
        setCreatedKey(body.apiKey ?? body.key ?? '')
        setShowCreateKey(false)
        setKeyForm({ name: '' })
        if (user) await fetchAll(user)
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
    const res = await fetch(`/api/v1/api-keys/${id}`, { method: 'DELETE' })
    if (res.ok && user) {
      await fetchAll(user)
    }
  }

  async function toggleKeyEnabled(key: ApiKeyData) {
    setKeyActionLoading(key.id)
    try {
      const res = await fetch(`/api/v1/api-keys/${key.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !key.enabled }),
      })
      if (res.ok && user) {
        await fetchAll(user)
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error || 'Failed to update key status')
      }
    } finally {
      setKeyActionLoading(null)
    }
  }

  function openEditKey(key: ApiKeyData) {
    setEditKey(key)
    setEditKeyName(key.name)
  }

  async function submitEditKey(e: React.FormEvent) {
    e.preventDefault()
    if (!editKey) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/api-keys/${editKey.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editKeyName }),
      })
      if (res.ok && user) {
        setEditKey(null)
        setEditKeyName('')
        await fetchAll(user)
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error || 'Failed to rename key')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function rotateKey(key: ApiKeyData) {
    if (!confirm(`Rotate API key "${key.name}"? The current key will stop working immediately.`)) return
    setKeyActionLoading(key.id)
    try {
      const res = await fetch(`/api/v1/api-keys/${key.id}/rotate`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setCreatedKey(body.apiKey ?? '')
        if (user) await fetchAll(user)
      } else {
        alert(body.error || 'Failed to rotate key')
      }
    } finally {
      setKeyActionLoading(null)
    }
  }

  function copyKey(key: string) {
    navigator.clipboard.writeText(key).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

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
      if (res.ok && user) {
        setShowAddRule(false)
        setRuleForm({ name: '', conditionType: 'FAILURE_RATE', providerId: '', threshold: '{"threshold": 50}', webhookUrl: '' })
        await fetchAll(user)
      }
    } catch {
      alert('Invalid threshold JSON')
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleRule(rule: AlertRuleData) {
    const res = await fetch(`/api/v1/alerts/rules/${rule.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    })
    if (res.ok && user) await fetchAll(user)
  }

  async function acknowledgeEvent(id: string) {
    const res = await fetch(`/api/v1/alerts/events/${id}`, { method: 'POST' })
    if (res.ok && user) await fetchAll(user)
  }

  const filteredEvents = alertEvents.filter((e) => {
    if (eventsFilter === 'unacked') return !e.acknowledged
    if (eventsFilter === 'acked') return e.acknowledged
    return true
  })

  if (loading || !user) return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Loading settings...</div></div>

  const tabs = user.role === 'ADMIN'
    ? ([['keys', 'API Keys'], ['rules', 'Alert Rules'], ['events', 'Alert Events']] as const)
    : ([['keys', 'API Keys']] as const)

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{user.role === 'ADMIN' ? 'Management' : 'API Keys'}</h2>

      {createdKey && (
        <div className="mb-6 rounded-lg shadow-sm border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-green-900">API Key Created</h4>
            <button onClick={() => setCreatedKey(null)} className="text-green-600 hover:text-green-800"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-green-700 mb-2">Copy this key now. It will not be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-green-300 rounded px-3 py-2 text-sm font-mono text-gray-900 break-all">{createdKey}</code>
            <button onClick={() => copyKey(createdKey)} className="p-2 bg-white border border-green-300 rounded hover:bg-green-100 text-green-700 shrink-0" title="Copy">{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
          </div>
        </div>
      )}

      <div className="flex gap-1 mb-6">
        {tabs.map(([val, label]) => (
          <button key={val} onClick={() => setActiveTab(val)} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${activeTab === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{label}</button>
        ))}
      </div>

      {activeTab === 'keys' && (
        <div>
          {user.role !== 'ADMIN' && (
            <div className="flex items-center justify-end mb-4">
              <button onClick={() => setShowCreateKey(true)} className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"><Plus className="w-4 h-4" />Create Key</button>
            </div>
          )}
          <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2.5 font-medium">Name</th>
                    {user.role === 'ADMIN' && <th className="px-4 py-2.5 font-medium">Owner</th>}
                    <th className="px-4 py-2.5 font-medium">Prefix</th>
                    <th className="px-4 py-2.5 font-medium">Enabled</th>
                    <th className="px-4 py-2.5 font-medium">Daily Limit</th>
                    <th className="px-4 py-2.5 font-medium">Monthly Limit</th>
                    <th className="px-4 py-2.5 font-medium">Daily Used</th>
                    <th className="px-4 py-2.5 font-medium">Monthly Used</th>
                    <th className="px-4 py-2.5 font-medium">Created</th>
                    <th className="px-4 py-2.5 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.length === 0 ? <tr><td colSpan={user.role === 'ADMIN' ? 10 : 9} className="px-4 py-8 text-center text-gray-400">No API keys</td></tr> : apiKeys.map((k, i) => (
                    <tr key={k.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{k.name}</td>
                      {user.role === 'ADMIN' && <td className="px-4 py-2.5 text-gray-600">{k.ownerUser?.email || '-'}</td>}
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{k.keyPrefix}...</td>
                      <td className="px-4 py-2.5"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${k.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{k.enabled ? 'Enabled' : 'Disabled'}</span></td>
                      <td className="px-4 py-2.5 text-gray-600">{k.quota?.dailyLimit ?? 'Unlimited'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{k.quota?.monthlyLimit ?? 'Unlimited'}</td>
                      <td className="px-4 py-2.5 text-gray-600">{k.quota?.dailyUsed ?? 0}</td>
                      <td className="px-4 py-2.5 text-gray-600">{k.quota?.monthlyUsed ?? 0}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{new Date(k.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        {user.role === 'ADMIN' ? (
                          <button onClick={() => revokeKey(k.id, k.name)} className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800"><Trash2 className="w-3.5 h-3.5" />Revoke</button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button onClick={() => toggleKeyEnabled(k)} disabled={keyActionLoading === k.id} className="inline-flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900 disabled:opacity-50">
                              {k.enabled ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                              {k.enabled ? 'Disable' : 'Enable'}
                            </button>
                            <button onClick={() => openEditKey(k)} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                              <Pencil className="w-3.5 h-3.5" />Rename
                            </button>
                            <button onClick={() => rotateKey(k)} disabled={keyActionLoading === k.id} className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50">
                              <RotateCcw className="w-3.5 h-3.5" />Rotate
                            </button>
                            <button onClick={() => revokeKey(k.id, k.name)} className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800"><Trash2 className="w-3.5 h-3.5" />Revoke</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {user.role === 'ADMIN' && activeTab === 'rules' && (
        <div>
          <div className="flex items-center justify-end mb-4"><button onClick={() => setShowAddRule(true)} className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"><Plus className="w-4 h-4" />Add Rule</button></div>
          <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left text-gray-500"><th className="px-4 py-2.5 font-medium">Name</th><th className="px-4 py-2.5 font-medium">Condition</th><th className="px-4 py-2.5 font-medium">Provider</th><th className="px-4 py-2.5 font-medium">Webhook URL</th><th className="px-4 py-2.5 font-medium">Enabled</th><th className="px-4 py-2.5 font-medium">Last Triggered</th><th className="px-4 py-2.5 font-medium">Actions</th></tr></thead><tbody>{alertRules.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No alert rules</td></tr> : alertRules.map((r, i) => <tr key={r.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}><td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td><td className="px-4 py-2.5 text-gray-600">{r.conditionType}</td><td className="px-4 py-2.5 text-gray-600">{providers.find((p) => p.id === r.providerId)?.name || 'All'}</td><td className="px-4 py-2.5 text-gray-600 max-w-[200px] truncate">{r.webhookUrl}</td><td className="px-4 py-2.5"><button onClick={() => toggleRule(r)} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${r.enabled ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}>{r.enabled ? 'Enabled' : 'Disabled'}</button></td><td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{r.lastTriggeredAt ? new Date(r.lastTriggeredAt).toLocaleString() : 'Never'}</td><td className="px-4 py-2.5"><button onClick={() => { if (!confirm(`Delete rule "${r.name}"?`)) return; fetch(`/api/v1/alerts/rules/${r.id}`, { method: 'DELETE' }).then((res) => { if (res.ok && user) fetchAll(user) }) }} className="text-red-600 hover:text-red-800"><Trash2 className="w-3.5 h-3.5" /></button></td></tr>)}</tbody></table></div></div>
        </div>
      )}

      {user.role === 'ADMIN' && activeTab === 'events' && (
        <div>
          <div className="flex items-center gap-2 mb-4">{([['all', 'All'], ['unacked', 'Unacknowledged'], ['acked', 'Acknowledged']] as const).map(([val, label]) => <button key={val} onClick={() => setEventsFilter(val)} className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${eventsFilter === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{label}</button>)}</div>
          <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left text-gray-500"><th className="px-4 py-2.5 font-medium">Time</th><th className="px-4 py-2.5 font-medium">Rule</th><th className="px-4 py-2.5 font-medium">Provider</th><th className="px-4 py-2.5 font-medium">Message</th><th className="px-4 py-2.5 font-medium">Severity</th><th className="px-4 py-2.5 font-medium">Acknowledged</th><th className="px-4 py-2.5 font-medium">Actions</th></tr></thead><tbody>{filteredEvents.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No alert events</td></tr> : filteredEvents.map((ev, i) => <tr key={ev.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}><td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{new Date(ev.createdAt).toLocaleString()}</td><td className="px-4 py-2.5 text-gray-700">{ev.ruleName || ev.ruleId.slice(0, 8)}</td><td className="px-4 py-2.5 text-gray-600">{ev.providerName || ev.providerId?.slice(0, 8) || 'All'}</td><td className="px-4 py-2.5 text-gray-600 max-w-[300px] truncate">{ev.message}</td><td className="px-4 py-2.5"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ev.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{ev.severity}</span></td><td className="px-4 py-2.5">{ev.acknowledged ? <span className="text-green-700 text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span>}</td><td className="px-4 py-2.5">{!ev.acknowledged && <button onClick={() => acknowledgeEvent(ev.id)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Acknowledge</button>}</td></tr>)}</tbody></table></div></div>
        </div>
      )}

      {user.role !== 'ADMIN' && showCreateKey && (
        <Modal title="Create API Key" onClose={() => setShowCreateKey(false)}>
          <form onSubmit={handleCreateKey} className="space-y-3">
            <Field label="Name"><input type="text" value={keyForm.name} onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })} className={inputCls} required placeholder="e.g. Production App" /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCreateKey(false)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? 'Creating...' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {user.role !== 'ADMIN' && editKey && (
        <Modal title="Rename API Key" onClose={() => setEditKey(null)}>
          <form onSubmit={submitEditKey} className="space-y-3">
            <Field label="Name"><input type="text" value={editKeyName} onChange={(e) => setEditKeyName(e.target.value)} className={inputCls} required /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditKey(null)} className={btnSecondary}>Cancel</button>
              <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {user.role === 'ADMIN' && showAddRule && (
        <Modal title="Add Alert Rule" onClose={() => setShowAddRule(false)}>
          <form onSubmit={handleAddRule} className="space-y-3">
            <Field label="Name"><input type="text" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} className={inputCls} required /></Field>
            <Field label="Condition Type"><select value={ruleForm.conditionType} onChange={(e) => setRuleForm({ ...ruleForm, conditionType: e.target.value })} className={inputCls}><option value="CIRCUIT_BREAKER">Circuit Breaker</option><option value="FAILURE_RATE">Failure Rate</option><option value="LATENCY_THRESHOLD">Latency Threshold</option><option value="PROVIDER_DOWN">Provider Down</option></select></Field>
            <Field label="Provider (optional)"><select value={ruleForm.providerId} onChange={(e) => setRuleForm({ ...ruleForm, providerId: e.target.value })} className={inputCls}><option value="">All Providers</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Threshold (JSON)"><input type="text" value={ruleForm.threshold} onChange={(e) => setRuleForm({ ...ruleForm, threshold: e.target.value })} className={inputCls} placeholder='{"threshold": 50}' /></Field>
            <Field label="Webhook URL"><input type="url" value={ruleForm.webhookUrl} onChange={(e) => setRuleForm({ ...ruleForm, webhookUrl: e.target.value })} className={inputCls} required placeholder="https://hooks.example.com/..." /></Field>
            <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowAddRule(false)} className={btnSecondary}>Cancel</button><button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? 'Creating...' : 'Create'}</button></div>
          </form>
        </Modal>
      )}
    </div>
  )
}
