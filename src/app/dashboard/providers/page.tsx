'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser } from '@/lib/dashboard/auth'
import { Plus, Pencil, ArrowUp, ArrowDown, Power, PowerOff, X, Eye, Copy, Check, Trash2 } from 'lucide-react'

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

function StatusBadge({ provider }: { provider: Provider }) {
  if (provider.circuitBreakerTrippedAt) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">TRIPPED</span>
  }
  if (!provider.enabled) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Disabled</span>
  }
  if (provider.cooldownUntil && new Date(provider.cooldownUntil) > new Date()) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">Cooldown</span>
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Enabled</span>
}

export default function ProvidersPage() {
  const router = useRouter()
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
      setError('Failed to load providers')
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

  async function toggleEnabled(p: Provider) {
    setActionLoading(p.id)
    try {
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
        alert(body.error || 'Failed to load provider API key')
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
        alert(body.error || 'Failed to create provider')
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
        alert(body.error || 'Failed to update provider')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteProvider(p: Provider) {
    if (p.enabled) {
      alert('Please disable the provider before deleting it.')
      return
    }

    if (!confirm(`Delete provider "${p.name}"? This action cannot be undone.`)) return

    setActionLoading(p.id)
    try {
      const res = await fetch(`/api/v1/providers/${p.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await fetchProviders()
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error || 'Failed to delete provider')
      }
    } finally {
      setActionLoading(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Loading providers...</div></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Providers</h2>
        <button onClick={() => setShowAddModal(true)} className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Add Provider
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Vendor</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Max Concurrent</th>
                <th className="px-4 py-2.5 font-medium">Success Rate</th>
                <th className="px-4 py-2.5 font-medium">Avg Latency</th>
                <th className="px-4 py-2.5 font-medium">Cost/Req</th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {providers.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No providers configured</td></tr>
              ) : providers.map((p, i) => (
                <tr key={p.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p.vendor}</td>
                  <td className="px-4 py-2.5"><StatusBadge provider={p} /></td>
                  <td className="px-4 py-2.5 text-gray-600">{p.priority}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p.maxConcurrent}</td>
                  <td className="px-4 py-2.5 text-gray-600">{successRate(p)}</td>
                  <td className="px-4 py-2.5 text-gray-600">{p.avgDurationMs > 0 ? `${p.avgDurationMs}ms` : 'N/A'}</td>
                  <td className="px-4 py-2.5 text-gray-600">${p.estimatedCostPerReq.toFixed(4)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggleEnabled(p)} disabled={actionLoading === p.id} title={p.enabled ? 'Disable' : 'Enable'} className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-50">{p.enabled ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}</button>
                      <button onClick={() => movePriority(p, 'up')} disabled={actionLoading === p.id} title="Move up" className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-50"><ArrowUp className="w-3.5 h-3.5" /></button>
                      <button onClick={() => movePriority(p, 'down')} disabled={actionLoading === p.id} title="Move down" className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-50"><ArrowDown className="w-3.5 h-3.5" /></button>
                      <button onClick={() => openEdit(p)} title="Edit" className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => showKey(p)} disabled={actionLoading === p.id} title="Show API Key" className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-700 disabled:opacity-50"><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteProvider(p)} disabled={actionLoading === p.id} title="Delete Provider" className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-700 disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <Modal title="Add Provider" onClose={() => setShowAddModal(false)}>
          <form onSubmit={handleAdd} className="space-y-3">
            <Field label="Name"><input type="text" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} className="w-full px-3 py-1.5 border border-gray-300 rounded text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required /></Field>
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
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors">Cancel</button>
              <button type="submit" disabled={submitting} className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">{submitting ? 'Creating...' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}

      {editProvider && (
        <Modal title={`Edit: ${editProvider.name}`} onClose={() => setEditProvider(null)}>
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
              <button type="button" onClick={() => setEditProvider(null)} className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors">Cancel</button>
              <button type="submit" disabled={submitting} className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">{submitting ? 'Saving...' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {showSecretModal && providerSecret && (
        <Modal title={`Provider API Key: ${providerSecret.name}`} onClose={() => { setShowSecretModal(false); setProviderSecret(null); setSecretCopied(false) }}>
          <div className="space-y-3">
            <p className="text-sm text-gray-500">This key is stored encrypted and shown here only for administrative review.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-50 border border-gray-200 rounded px-3 py-2 text-sm font-mono text-gray-900 break-all">{providerSecret.apiKey}</code>
              <button onClick={copySecret} className="p-2 bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-700 shrink-0" title="Copy">
                {secretCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="flex justify-end pt-2">
              <button type="button" onClick={() => { setShowSecretModal(false); setProviderSecret(null); setSecretCopied(false) }} className="px-4 py-1.5 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors">Close</button>
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
