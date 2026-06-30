'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'
import { Plus, X, Copy, Trash2, Check, Pencil, RotateCcw, Power, PowerOff } from 'lucide-react'
import { roleLabel, useDashboardI18n } from '@/lib/dashboard/i18n'

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
  const { lang, t } = useDashboardI18n()
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
        const rawKeys = Array.isArray(d) ? d : d.keys ?? d.data ?? []
        const visibleKeys = currentUser.role === 'ADMIN'
          ? rawKeys.filter((key: { name?: string; enabled?: boolean }) => !(key.name?.startsWith('Admin Test Key ') && key.enabled === false))
          : rawKeys
        setApiKeys(visibleKeys)
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
        alert(body.error || (lang === 'zh' ? '创建密钥失败' : 'Failed to create key'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function revokeKey(id: string, name: string) {
    if (!confirm(lang === 'zh' ? `确认撤销 API 密钥“${name}”吗？此操作无法撤销。` : `Revoke API key "${name}"? This cannot be undone.`)) return
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
        alert(body.error || (lang === 'zh' ? '更新密钥状态失败' : 'Failed to update key status'))
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
        alert(body.error || (lang === 'zh' ? '重命名密钥失败' : 'Failed to rename key'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function rotateKey(key: ApiKeyData) {
    if (!confirm(lang === 'zh' ? `确认轮转 API 密钥“${key.name}”吗？当前密钥会立即失效。` : `Rotate API key "${key.name}"? The current key will stop working immediately.`)) return
    setKeyActionLoading(key.id)
    try {
      const res = await fetch(`/api/v1/api-keys/${key.id}/rotate`, { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setCreatedKey(body.apiKey ?? '')
        if (user) await fetchAll(user)
      } else {
        alert(body.error || (lang === 'zh' ? '轮转密钥失败' : 'Failed to rotate key'))
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
      alert(lang === 'zh' ? 'Threshold JSON 无效' : 'Invalid threshold JSON')
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

  const conditionLabel = (value: string) => {
    switch (value) {
      case 'CIRCUIT_BREAKER':
        return lang === 'zh' ? '熔断触发' : 'Circuit Breaker'
      case 'FAILURE_RATE':
        return lang === 'zh' ? '失败率' : 'Failure Rate'
      case 'LATENCY_THRESHOLD':
        return lang === 'zh' ? '延迟阈值' : 'Latency Threshold'
      case 'PROVIDER_DOWN':
        return lang === 'zh' ? '供应商不可用' : 'Provider Down'
      default:
        return value
    }
  }

  if (loading || !user) return <div className="flex items-center justify-center h-64"><div className="text-gray-500">{lang === 'zh' ? '正在加载设置...' : 'Loading settings...'}</div></div>

  const tabs = user.role === 'ADMIN'
    ? ([['keys', lang === 'zh' ? 'API 密钥' : 'API Keys'], ['rules', lang === 'zh' ? '告警规则' : 'Alert Rules'], ['events', lang === 'zh' ? '告警事件' : 'Alert Events']] as const)
    : ([['keys', lang === 'zh' ? 'API 密钥' : 'API Keys']] as const)

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{user.role === 'ADMIN' ? t('navManagement') : t('navApiKeys')}</h2>

      {createdKey && (
        <div className="mb-6 rounded-lg shadow-sm border border-green-200 bg-green-50 p-4">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-green-900">{lang === 'zh' ? 'API 密钥已创建' : 'API Key Created'}</h4>
            <button onClick={() => setCreatedKey(null)} className="text-green-600 hover:text-green-800"><X className="w-4 h-4" /></button>
          </div>
          <p className="text-xs text-green-700 mb-2">{lang === 'zh' ? '请立即复制该密钥，之后不会再次展示。' : 'Copy this key now. It will not be shown again.'}</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-white border border-green-300 rounded px-3 py-2 text-sm font-mono text-gray-900 break-all">{createdKey}</code>
            <button onClick={() => copyKey(createdKey)} className="p-2 bg-white border border-green-300 rounded hover:bg-green-100 text-green-700 shrink-0" title={lang === 'zh' ? '复制' : 'Copy'}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
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
              <button onClick={() => setShowCreateKey(true)} className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"><Plus className="w-4 h-4" />{lang === 'zh' ? '创建密钥' : 'Create Key'}</button>
            </div>
          )}
          <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="px-4 py-2.5 font-medium">{t('name')}</th>
                    {user.role === 'ADMIN' && <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '归属用户' : 'Owner'}</th>}
                    <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '前缀' : 'Prefix'}</th>
                    <th className="px-4 py-2.5 font-medium">{t('enabled')}</th>
                    <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '日限额' : 'Daily Limit'}</th>
                    <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '月限额' : 'Monthly Limit'}</th>
                    <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '日已用' : 'Daily Used'}</th>
                    <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '月已用' : 'Monthly Used'}</th>
                    <th className="px-4 py-2.5 font-medium">{t('created')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {apiKeys.length === 0 ? <tr><td colSpan={user.role === 'ADMIN' ? 10 : 9} className="px-4 py-8 text-center text-gray-400">{lang === 'zh' ? '没有 API 密钥' : 'No API keys'}</td></tr> : apiKeys.map((k, i) => (
                    <tr key={k.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{k.name}</td>
                      {user.role === 'ADMIN' && <td className="px-4 py-2.5 text-gray-600">{k.ownerUser?.email || '-'}</td>}
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{k.keyPrefix}...</td>
                      <td className="px-4 py-2.5"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${k.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{k.enabled ? t('enabled') : t('disabled')}</span></td>
                      <td className="px-4 py-2.5 text-gray-600">{k.quota?.dailyLimit ?? (lang === 'zh' ? '无限制' : 'Unlimited')}</td>
                      <td className="px-4 py-2.5 text-gray-600">{k.quota?.monthlyLimit ?? (lang === 'zh' ? '无限制' : 'Unlimited')}</td>
                      <td className="px-4 py-2.5 text-gray-600">{k.quota?.dailyUsed ?? 0}</td>
                      <td className="px-4 py-2.5 text-gray-600">{k.quota?.monthlyUsed ?? 0}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{new Date(k.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        {user.role === 'ADMIN' ? (
                          <button onClick={() => revokeKey(k.id, k.name)} className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800"><Trash2 className="w-3.5 h-3.5" />{lang === 'zh' ? '撤销' : 'Revoke'}</button>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button onClick={() => toggleKeyEnabled(k)} disabled={keyActionLoading === k.id} className="inline-flex items-center gap-1 text-xs text-gray-700 hover:text-gray-900 disabled:opacity-50">
                              {k.enabled ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                              {k.enabled ? (lang === 'zh' ? '禁用' : 'Disable') : (lang === 'zh' ? '启用' : 'Enable')}
                            </button>
                            <button onClick={() => openEditKey(k)} className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
                              <Pencil className="w-3.5 h-3.5" />{lang === 'zh' ? '重命名' : 'Rename'}
                            </button>
                            <button onClick={() => rotateKey(k)} disabled={keyActionLoading === k.id} className="inline-flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 disabled:opacity-50">
                              <RotateCcw className="w-3.5 h-3.5" />{lang === 'zh' ? '轮转' : 'Rotate'}
                            </button>
                            <button onClick={() => revokeKey(k.id, k.name)} className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800"><Trash2 className="w-3.5 h-3.5" />{lang === 'zh' ? '撤销' : 'Revoke'}</button>
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
          <div className="flex items-center justify-end mb-4"><button onClick={() => setShowAddRule(true)} className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"><Plus className="w-4 h-4" />{lang === 'zh' ? '新增规则' : 'Add Rule'}</button></div>
          <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left text-gray-500"><th className="px-4 py-2.5 font-medium">{t('name')}</th><th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '条件' : 'Condition'}</th><th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '供应商' : 'Provider'}</th><th className="px-4 py-2.5 font-medium">Webhook URL</th><th className="px-4 py-2.5 font-medium">{t('enabled')}</th><th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '最近触发' : 'Last Triggered'}</th><th className="px-4 py-2.5 font-medium">{t('actions')}</th></tr></thead><tbody>{alertRules.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{lang === 'zh' ? '没有告警规则' : 'No alert rules'}</td></tr> : alertRules.map((r, i) => <tr key={r.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}><td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td><td className="px-4 py-2.5 text-gray-600">{conditionLabel(r.conditionType)}</td><td className="px-4 py-2.5 text-gray-600">{providers.find((p) => p.id === r.providerId)?.name || (lang === 'zh' ? '全部' : 'All')}</td><td className="px-4 py-2.5 text-gray-600 max-w-[200px] truncate">{r.webhookUrl}</td><td className="px-4 py-2.5"><button onClick={() => toggleRule(r)} className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${r.enabled ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-red-100 text-red-800 hover:bg-red-200'}`}>{r.enabled ? t('enabled') : t('disabled')}</button></td><td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{r.lastTriggeredAt ? new Date(r.lastTriggeredAt).toLocaleString() : (lang === 'zh' ? '从未' : 'Never')}</td><td className="px-4 py-2.5"><button onClick={() => { if (!confirm(lang === 'zh' ? `确认删除规则“${r.name}”吗？` : `Delete rule "${r.name}"?`)) return; fetch(`/api/v1/alerts/rules/${r.id}`, { method: 'DELETE' }).then((res) => { if (res.ok && user) fetchAll(user) }) }} className="text-red-600 hover:text-red-800" title={lang === 'zh' ? '删除规则' : 'Delete rule'}><Trash2 className="w-3.5 h-3.5" /></button></td></tr>)}</tbody></table></div></div>
        </div>
      )}

      {user.role === 'ADMIN' && activeTab === 'events' && (
        <div>
          <div className="flex items-center gap-2 mb-4">{([['all', lang === 'zh' ? '全部' : 'All'], ['unacked', lang === 'zh' ? '未确认' : 'Unacknowledged'], ['acked', lang === 'zh' ? '已确认' : 'Acknowledged']] as const).map(([val, label]) => <button key={val} onClick={() => setEventsFilter(val)} className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${eventsFilter === val ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{label}</button>)}</div>
          <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left text-gray-500"><th className="px-4 py-2.5 font-medium">{t('time')}</th><th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '规则' : 'Rule'}</th><th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '供应商' : 'Provider'}</th><th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '消息' : 'Message'}</th><th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '严重级别' : 'Severity'}</th><th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '已确认' : 'Acknowledged'}</th><th className="px-4 py-2.5 font-medium">{t('actions')}</th></tr></thead><tbody>{filteredEvents.length === 0 ? <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">{lang === 'zh' ? '没有告警事件' : 'No alert events'}</td></tr> : filteredEvents.map((ev, i) => <tr key={ev.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}><td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{new Date(ev.createdAt).toLocaleString()}</td><td className="px-4 py-2.5 text-gray-700">{ev.ruleName || ev.ruleId.slice(0, 8)}</td><td className="px-4 py-2.5 text-gray-600">{ev.providerName || ev.providerId?.slice(0, 8) || (lang === 'zh' ? '全部' : 'All')}</td><td className="px-4 py-2.5 text-gray-600 max-w-[300px] truncate">{ev.message}</td><td className="px-4 py-2.5"><span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ev.severity === 'CRITICAL' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}>{ev.severity === 'CRITICAL' ? (lang === 'zh' ? '严重' : 'Critical') : (lang === 'zh' ? '警告' : 'Warning')}</span></td><td className="px-4 py-2.5">{ev.acknowledged ? <span className="text-green-700 text-xs">{lang === 'zh' ? '是' : 'Yes'}</span> : <span className="text-gray-400 text-xs">{lang === 'zh' ? '否' : 'No'}</span>}</td><td className="px-4 py-2.5">{!ev.acknowledged && <button onClick={() => acknowledgeEvent(ev.id)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">{lang === 'zh' ? '确认' : 'Acknowledge'}</button>}</td></tr>)}</tbody></table></div></div>
        </div>
      )}

      {user.role !== 'ADMIN' && showCreateKey && (
        <Modal title={lang === 'zh' ? '创建 API 密钥' : 'Create API Key'} onClose={() => setShowCreateKey(false)}>
          <form onSubmit={handleCreateKey} className="space-y-3">
            <Field label={t('name')}><input type="text" value={keyForm.name} onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })} className={inputCls} required placeholder={lang === 'zh' ? '例如：生产环境应用' : 'e.g. Production App'} /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowCreateKey(false)} className={btnSecondary}>{lang === 'zh' ? '取消' : 'Cancel'}</button>
              <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? (lang === 'zh' ? '创建中...' : 'Creating...') : (lang === 'zh' ? '创建' : 'Create')}</button>
            </div>
          </form>
        </Modal>
      )}

      {user.role !== 'ADMIN' && editKey && (
        <Modal title={lang === 'zh' ? '重命名 API 密钥' : 'Rename API Key'} onClose={() => setEditKey(null)}>
          <form onSubmit={submitEditKey} className="space-y-3">
            <Field label={t('name')}><input type="text" value={editKeyName} onChange={(e) => setEditKeyName(e.target.value)} className={inputCls} required /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditKey(null)} className={btnSecondary}>{lang === 'zh' ? '取消' : 'Cancel'}</button>
              <button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? (lang === 'zh' ? '保存中...' : 'Saving...') : (lang === 'zh' ? '保存' : 'Save')}</button>
            </div>
          </form>
        </Modal>
      )}

      {user.role === 'ADMIN' && showAddRule && (
        <Modal title={lang === 'zh' ? '新增告警规则' : 'Add Alert Rule'} onClose={() => setShowAddRule(false)}>
          <form onSubmit={handleAddRule} className="space-y-3">
            <Field label={t('name')}><input type="text" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} className={inputCls} required /></Field>
            <Field label={lang === 'zh' ? '条件类型' : 'Condition Type'}><select value={ruleForm.conditionType} onChange={(e) => setRuleForm({ ...ruleForm, conditionType: e.target.value })} className={inputCls}><option value="CIRCUIT_BREAKER">{lang === 'zh' ? '熔断触发' : 'Circuit Breaker'}</option><option value="FAILURE_RATE">{lang === 'zh' ? '失败率' : 'Failure Rate'}</option><option value="LATENCY_THRESHOLD">{lang === 'zh' ? '延迟阈值' : 'Latency Threshold'}</option><option value="PROVIDER_DOWN">{lang === 'zh' ? '供应商不可用' : 'Provider Down'}</option></select></Field>
            <Field label={lang === 'zh' ? '供应商（可选）' : 'Provider (optional)'}><select value={ruleForm.providerId} onChange={(e) => setRuleForm({ ...ruleForm, providerId: e.target.value })} className={inputCls}><option value="">{lang === 'zh' ? '全部供应商' : 'All Providers'}</option>{providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Threshold (JSON)"><input type="text" value={ruleForm.threshold} onChange={(e) => setRuleForm({ ...ruleForm, threshold: e.target.value })} className={inputCls} placeholder='{"threshold": 50}' /></Field>
            <Field label="Webhook URL"><input type="url" value={ruleForm.webhookUrl} onChange={(e) => setRuleForm({ ...ruleForm, webhookUrl: e.target.value })} className={inputCls} required placeholder="https://hooks.example.com/..." /></Field>
            <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowAddRule(false)} className={btnSecondary}>{lang === 'zh' ? '取消' : 'Cancel'}</button><button type="submit" disabled={submitting} className={btnPrimary}>{submitting ? (lang === 'zh' ? '创建中...' : 'Creating...') : (lang === 'zh' ? '创建' : 'Create')}</button></div>
          </form>
        </Modal>
      )}
    </div>
  )
}
