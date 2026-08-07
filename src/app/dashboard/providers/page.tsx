'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser } from '@/lib/dashboard/auth'
import { groupImageProviderModel } from '@/lib/image-models'
import { Plus, Pencil, ArrowUp, ArrowDown, Power, PowerOff, X, Eye, Copy, Check, Trash2, RotateCcw } from 'lucide-react'
import { useDashboardI18n } from '@/lib/dashboard/i18n'

interface Provider {
  id: string
  name: string
  vendor: string
  baseUrl: string
  model: string
  priority: number
  enabled: boolean
  maxConcurrent: number
  totalAttempts: number
  successfulAttempts: number
  avgDurationMs: number
  estimatedCostPerReq: number
  failureCount: number
  cooldownUntil: string | null
  circuitBreakerTrippedAt: string | null
  circuitBreakerTripReason: string | null
  createdAt: string
  updatedAt: string
}

interface EditFormData {
  name: string
  vendor: string
  baseUrl: string
  model: string
  priority: number
  estimatedCostPerReq: number
  maxConcurrent: number
}

interface AddFormData {
  name: string
  vendor: string
  baseUrl: string
  model: string
  priority: number
  apiKeyPlaintext: string
  estimatedCostPerReq: number
  maxConcurrent: number
}

const emptyAdd: AddFormData = {
  name: '',
  vendor: '',
  baseUrl: '',
  model: '',
  priority: 100,
  apiKeyPlaintext: '',
  estimatedCostPerReq: 0,
  maxConcurrent: 3,
}

function successRate(p: Provider): string {
  if (p.totalAttempts === 0) return 'N/A'
  return ((p.successfulAttempts / p.totalAttempts) * 100).toFixed(1) + '%'
}

const MODEL_ORDER = ['gpt-image-2', 'agnes-image-2.1-flash']

function groupProvidersByModel(providers: Provider[]) {
  const groups = providers.reduce<Record<string, Provider[]>>((acc, provider) => {
    const modelGroup = groupImageProviderModel(provider.model)
    if (!acc[modelGroup]) acc[modelGroup] = []
    acc[modelGroup].push(provider)
    return acc
  }, {})

  return Object.entries(groups).sort(([modelA], [modelB]) => {
    const indexA = MODEL_ORDER.indexOf(modelA)
    const indexB = MODEL_ORDER.indexOf(modelB)

    if (indexA !== -1 || indexB !== -1) {
      const normalizedA = indexA === -1 ? MODEL_ORDER.length : indexA
      const normalizedB = indexB === -1 ? MODEL_ORDER.length : indexB
      return normalizedA - normalizedB
    }

    return modelA.localeCompare(modelB)
  })
}

function getGroupLabel(model: string, modelProviders: Provider[]) {
  const actualModels = [...new Set(modelProviders.map((provider) => provider.model))]
  const aliases = actualModels.filter((value) => value !== model)

  if (model === 'gpt-image-2') {
    return {
      title: 'gpt-image-2',
      subtitle: aliases.length > 0
        ? `Providers: ${modelProviders.length} · Aliases: ${aliases.join(', ')}`
        : `Providers: ${modelProviders.length}`,
    }
  }

  return {
    title: model,
    subtitle: `Providers: ${modelProviders.length}`,
  }
}

function StatusBadge({ provider }: { provider: Provider }) {
  const { lang, t } = useDashboardI18n()
  if (provider.circuitBreakerTrippedAt) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">{lang === 'zh' ? '已熔断' : 'TRIPPED'}</span>
  }
  if (!provider.enabled) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">{t('disabled')}</span>
  }
  if (provider.cooldownUntil && new Date(provider.cooldownUntil) > new Date()) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">{lang === 'zh' ? '冷却中' : 'Cooldown'}</span>
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">{t('enabled')}</span>
}

export default function ProvidersPage() {
  const router = useRouter()
  const { lang, t } = useDashboardI18n()
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editProvider, setEditProvider] = useState<Provider | null>(null)
  const [showSecretModal, setShowSecretModal] = useState(false)
  const [providerSecret, setProviderSecret] = useState<{ name: string; apiKey: string } | null>(null)
  const [secretCopied, setSecretCopied] = useState(false)
  const [addForm, setAddForm] = useState<AddFormData>({ ...emptyAdd })
  const [editForm, setEditForm] = useState<EditFormData>({
    name: '', vendor: '', baseUrl: '', model: '', priority: 100, estimatedCostPerReq: 0, maxConcurrent: 3,
  })
  const [submitting, setSubmitting] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/providers')
      if (res.status === 401 || res.status === 403) {
        router.push('/dashboard')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setProviders(Array.isArray(json) ? json : json.data ?? json.providers ?? [])
      setError('')
    } catch {
      setError(lang === 'zh' ? '加载供应商失败' : 'Failed to load providers')
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    fetchCurrentUser().then((user) => {
      if (!user) {
        router.push('/dashboard/login')
        return
      }
      if (user.role !== 'ADMIN') {
        router.push('/dashboard')
        return
      }
      fetchProviders()
    })
  }, [fetchProviders, router])

  async function toggleProviderState(p: Provider) {
    setActionLoading(p.id)
    try {
      if (p.circuitBreakerTrippedAt) {
        const res = await fetch(`/api/v1/providers/${p.id}/reset-breaker`, { method: 'POST' })
        if (res.ok) await fetchProviders()
        return
      }

      const res = await fetch(`/api/v1/providers/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !p.enabled }),
      })
      if (res.ok) await fetchProviders()
    } finally {
      setActionLoading(null)
    }
  }

  async function movePriority(p: Provider, direction: 'up' | 'down') {
    setActionLoading(p.id)
    try {
      const res = await fetch(`/api/v1/providers/${p.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      })
      if (res.ok) await fetchProviders()
    } finally {
      setActionLoading(null)
    }
  }

  async function showKey(p: Provider) {
    setActionLoading(p.id)
    try {
      const res = await fetch(`/api/v1/providers/${p.id}/secret`)
      const body = await res.json().catch(() => ({}))
      if (res.ok) {
        setProviderSecret({
          name: body.data.name,
          apiKey: body.data.apiKey,
        })
        setShowSecretModal(true)
      } else {
        alert(body.error || (lang === 'zh' ? '加载 Provider API Key 失败' : 'Failed to load provider API key'))
      }
    } finally {
      setActionLoading(null)
    }
  }

  function copySecret() {
    if (!providerSecret?.apiKey) return
    navigator.clipboard.writeText(providerSecret.apiKey).then(() => {
      setSecretCopied(true)
      setTimeout(() => setSecretCopied(false), 2000)
    })
  }

  function openEdit(p: Provider) {
    setEditProvider(p)
    setEditForm({
      name: p.name,
      vendor: p.vendor,
      baseUrl: p.baseUrl,
      model: p.model,
      priority: p.priority,
      estimatedCostPerReq: p.estimatedCostPerReq,
      maxConcurrent: p.maxConcurrent,
    })
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await fetch('/api/v1/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      })
      if (res.ok) {
        setShowAddModal(false)
        setAddForm({ ...emptyAdd })
        await fetchProviders()
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error || (lang === 'zh' ? '创建供应商失败' : 'Failed to create provider'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editProvider) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/v1/providers/${editProvider.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })
      if (res.ok) {
        setEditProvider(null)
        await fetchProviders()
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error || (lang === 'zh' ? '更新供应商失败' : 'Failed to update provider'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteProvider(p: Provider) {
    if (p.enabled) {
      alert(lang === 'zh' ? '请先禁用该供应商再删除。' : 'Please disable the provider before deleting it.')
      return
    }

    if (!confirm(lang === 'zh' ? `确认删除供应商“${p.name}”吗？此操作无法撤销。` : `Delete provider "${p.name}"? This action cannot be undone.`)) return

    setActionLoading(p.id)
    try {
      const res = await fetch(`/api/v1/providers/${p.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await fetchProviders()
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error || (lang === 'zh' ? '删除供应商失败' : 'Failed to delete provider'))
      }
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-500">{lang === 'zh' ? '正在加载供应商...' : 'Loading providers...'}</div></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{t('navProviders')}</h2>
        <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> {lang === 'zh' ? '新增供应商' : 'Add Provider'}
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {providers.length === 0 ? (
        <div className="rounded-lg shadow-sm border border-gray-200 bg-white px-4 py-8 text-center text-gray-400">{lang === 'zh' ? '尚未配置供应商' : 'No providers configured'}</div>
      ) : (
        <div className="space-y-6">
          {groupProvidersByModel(providers).map(([model, modelProviders]) => (
            <div key={model} className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                <div>
                  {(() => {
                    const label = getGroupLabel(model, modelProviders)
                    return (
                      <>
                        <h3 className="text-sm font-semibold text-gray-900">{label.title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{label.subtitle}</p>
                      </>
                    )
                  })()}
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-500">
                      <th className="px-4 py-2.5 font-medium">{t('name')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('vendor')}</th>
                      <th className="px-4 py-2.5 font-medium">{t('status')}</th>
                      <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '优先级' : 'Priority'}</th>
                      <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '最大并发' : 'Max Concurrent'}</th>
                      <th className="px-4 py-2.5 font-medium">{t('successRate')}</th>
                      <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '平均延迟' : 'Avg Latency'}</th>
                      <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '单次成本' : 'Cost/Req'}</th>
                      <th className="px-4 py-2.5 font-medium">{t('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelProviders.map((p, i) => (
                      <tr key={p.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                        <td className="px-4 py-2.5 text-gray-600">{p.vendor}</td>
                        <td className="px-4 py-2.5"><StatusBadge provider={p} /></td>
                        <td className="px-4 py-2.5 text-gray-600">{p.priority}</td>
                        <td className="px-4 py-2.5 text-gray-600">{p.maxConcurrent}</td>
                        <td className="px-4 py-2.5 text-gray-600">{successRate(p)}</td>
                        <td className="px-4 py-2.5 text-gray-600">{p.avgDurationMs > 0 ? `${p.avgDurationMs}ms` : t('na')}</td>
                        <td className="px-4 py-2.5 text-gray-600">${p.estimatedCostPerReq.toFixed(4)}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <button onClick={() => toggleProviderState(p)} disabled={actionLoading === p.id} title={p.circuitBreakerTrippedAt ? (lang === 'zh' ? '恢复服务' : 'Restore service') : p.enabled ? (lang === 'zh' ? '禁用' : 'Disable') : (lang === 'zh' ? '启用' : 'Enable')} className={`p-1 rounded disabled:opacity-50 ${p.circuitBreakerTrippedAt ? 'text-emerald-700 hover:bg-emerald-50' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}>{p.circuitBreakerTrippedAt ? <RotateCcw className="w-3.5 h-3.5" /> : p.enabled ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}</button>
                            <button onClick={() => movePriority(p, 'up')} disabled={actionLoading === p.id} title={lang === 'zh' ? '上移' : 'Move up'} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-50"><ArrowUp className="w-3.5 h-3.5" /></button>
                            <button onClick={() => movePriority(p, 'down')} disabled={actionLoading === p.id} title={lang === 'zh' ? '下移' : 'Move down'} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-50"><ArrowDown className="w-3.5 h-3.5" /></button>
                            <button onClick={() => openEdit(p)} title={lang === 'zh' ? '编辑' : 'Edit'} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"><Pencil className="w-3.5 h-3.5" /></button>
                            <button onClick={() => showKey(p)} disabled={actionLoading === p.id} title={lang === 'zh' ? '查看 API Key' : 'Show API Key'} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-50"><Eye className="w-3.5 h-3.5" /></button>
                            <button onClick={() => deleteProvider(p)} disabled={actionLoading === p.id} title={lang === 'zh' ? '删除供应商' : 'Delete Provider'} className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-700 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <Modal title={lang === 'zh' ? '新增供应商' : 'Add Provider'} onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAdd} className="space-y-3">
            <Field label={t('name')}><input type="text" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
            <Field label="Vendor"><input type="text" value={addForm.vendor} onChange={(e) => setAddForm({ ...addForm, vendor: e.target.value })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
            <Field label="Base URL"><input type="url" value={addForm.baseUrl} onChange={(e) => setAddForm({ ...addForm, baseUrl: e.target.value })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
            <Field label="Model"><input type="text" value={addForm.model} onChange={(e) => setAddForm({ ...addForm, model: e.target.value })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Priority"><input type="number" value={addForm.priority} onChange={(e) => setAddForm({ ...addForm, priority: Number(e.target.value) })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
              <Field label="Max Concurrent"><input type="number" min="1" value={addForm.maxConcurrent} onChange={(e) => setAddForm({ ...addForm, maxConcurrent: Number(e.target.value) })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
              <Field label="Cost/Req ($)"><input type="number" step="0.0001" value={addForm.estimatedCostPerReq} onChange={(e) => setAddForm({ ...addForm, estimatedCostPerReq: Number(e.target.value) })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>
            </div>
            <Field label="API Key"><input type="password" value={addForm.apiKeyPlaintext} onChange={(e) => setAddForm({ ...addForm, apiKeyPlaintext: e.target.value })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors">{lang === 'zh' ? '取消' : 'Cancel'}</button>
              <button type="submit" disabled={submitting} className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">{submitting ? (lang === 'zh' ? '创建中...' : 'Creating...') : (lang === 'zh' ? '创建' : 'Create')}</button>
            </div>
          </form>
        </Modal>
      )}

      {editProvider && (
        <Modal title={lang === 'zh' ? `编辑：${editProvider.name}` : `Edit: ${editProvider.name}`} onClose={() => setEditProvider(null)}>
          <form onSubmit={handleEdit} className="space-y-3">
            <Field label="Name"><input type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
            <Field label="Vendor"><input type="text" value={editForm.vendor} onChange={(e) => setEditForm({ ...editForm, vendor: e.target.value })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
            <Field label="Base URL"><input type="url" value={editForm.baseUrl} onChange={(e) => setEditForm({ ...editForm, baseUrl: e.target.value })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
            <Field label="Model"><input type="text" value={editForm.model} onChange={(e) => setEditForm({ ...editForm, model: e.target.value })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Priority"><input type="number" value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: Number(e.target.value) })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
              <Field label="Max Concurrent"><input type="number" min="1" value={editForm.maxConcurrent} onChange={(e) => setEditForm({ ...editForm, maxConcurrent: Number(e.target.value) })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
              <Field label="Cost/Req ($)"><input type="number" step="0.0001" value={editForm.estimatedCostPerReq} onChange={(e) => setEditForm({ ...editForm, estimatedCostPerReq: Number(e.target.value) })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditProvider(null)} className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors">{lang === 'zh' ? '取消' : 'Cancel'}</button>
              <button type="submit" disabled={submitting} className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">{submitting ? t('saving') : (lang === 'zh' ? '保存' : 'Save')}</button>
            </div>
          </form>
        </Modal>
      )}

      {showSecretModal && providerSecret && (
        <Modal title={lang === 'zh' ? `Provider API Key：${providerSecret.name}` : `Provider API Key: ${providerSecret.name}`} onClose={() => { setShowSecretModal(false); setProviderSecret(null); setSecretCopied(false) }}>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">{lang === 'zh' ? '该密钥以加密形式存储，这里仅供管理员查看。' : 'This key is stored encrypted and shown here only for administrative review.'}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm font-mono text-gray-900 break-all">{providerSecret.apiKey}</code>
              <button onClick={copySecret} className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-700 shrink-0" title={lang === 'zh' ? '复制' : 'Copy'}>
                {secretCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button type="button" onClick={() => { setShowSecretModal(false); setProviderSecret(null); setSecretCopied(false) }} className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors">{lang === 'zh' ? '关闭' : 'Close'}</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>{children}</div>
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
