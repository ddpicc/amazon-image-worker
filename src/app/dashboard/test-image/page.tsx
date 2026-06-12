'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser } from '@/lib/dashboard/auth'

type TaskStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
type TestMode = 'queue' | 'direct'

interface ProviderOption {
  id: string
  name: string
  vendor: string
  model: string
  baseUrl: string
  enabled: boolean
  cooldownUntil?: string | null
  circuitBreakerTrippedAt?: string | null
  circuitBreakerTripReason?: string | null
}

interface TaskAsset {
  id: string
  cosUrl: string
  mimeType: string
  bytes: number
  createdAt: string
}

interface TaskAttempt {
  id: string
  attemptIndex: number
  model: string
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED'
  durationMs: number | null
  errorMessage: string | null
}

interface TaskDetail {
  id: string
  prompt: string
  status: TaskStatus
  statusMessage: string | null
  errorMessage: string | null
  selectedProviderName: string | null
  durationMs: number | null
  assets: TaskAsset[]
  attempts: TaskAttempt[]
  createdAt: string
  completedAt: string | null
}

interface DirectTestResult {
  provider: ProviderOption
  mode: 'generate' | 'edit'
  prompt: string
  size: string
  referenceImageUrls: string[]
  durationMs: number
  revisedPrompt: string
  returnedImageUrlKind: 'data-url' | 'remote-url' | 'b64-json'
  upstreamImageUrl: string | null
  mimeType: string
  bytes: number
  imageBase64: string
}

function getProviderState(provider: ProviderOption): 'TRIPPED' | 'DISABLED' | 'COOLDOWN' | 'ENABLED' {
  if (provider.circuitBreakerTrippedAt) return 'TRIPPED'
  if (!provider.enabled) return 'DISABLED'
  if (provider.cooldownUntil && new Date(provider.cooldownUntil).getTime() > Date.now()) return 'COOLDOWN'
  return 'ENABLED'
}

function providerStateBadgeClass(state: ReturnType<typeof getProviderState>): string {
  switch (state) {
    case 'TRIPPED':
      return 'bg-red-100 text-red-800'
    case 'DISABLED':
      return 'bg-gray-200 text-gray-700'
    case 'COOLDOWN':
      return 'bg-yellow-100 text-yellow-800'
    default:
      return 'bg-green-100 text-green-800'
  }
}

const DEFAULT_PROMPT = 'A premium ecommerce studio photo of a ceramic mug with soft shadow and clean white background'
const DEFAULT_EDIT_PROMPT = 'Transform the scene into a rain-soaked cyberpunk night with neon reflections'
const DEFAULT_REFERENCE_IMAGE = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/300px-PNG_transparency_demonstration_1.png'

function formatDuration(ms: number | null): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

export default function AdminTestImagePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [size, setSize] = useState('1024x1024')
  const [mode, setMode] = useState<TestMode>('queue')
  const [editMode, setEditMode] = useState(false)
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([''])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [requestId, setRequestId] = useState('')
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [directResult, setDirectResult] = useState<DirectTestResult | null>(null)
  const [resettingBreaker, setResettingBreaker] = useState(false)
  const [error, setError] = useState('')

  const isActiveTask = useMemo(
    () => task?.status === 'QUEUED' || task?.status === 'PROCESSING',
    [task],
  )

  useEffect(() => {
    let mounted = true
    fetchCurrentUser().then((user) => {
      if (!mounted) return
      if (!user) {
        router.push('/dashboard/login')
        return
      }
      if (user.role !== 'ADMIN') {
        router.push('/dashboard')
        return
      }
      setLoading(false)
    })

    return () => {
      mounted = false
    }
  }, [router])

  useEffect(() => {
    if (loading) {
      return
    }

    let cancelled = false

    async function loadProviders() {
      try {
        const res = await fetch('/api/v1/providers', {
          credentials: 'include',
          cache: 'no-store',
        })
        const json = await res.json().catch(() => null)
        if (!res.ok) {
          throw new Error(json?.error || `Failed to load providers (${res.status})`)
        }

        const nextProviders = json?.data || []
        if (!cancelled) {
          setProviders(nextProviders)
          setSelectedProviderId((current) => current || nextProviders[0]?.id || '')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load providers')
        }
      }
    }

    loadProviders()

    return () => {
      cancelled = true
    }
  }, [loading])

  useEffect(() => {
    if (!requestId || mode !== 'queue') {
      return
    }

    let cancelled = false

    const loadTask = async () => {
      const res = await fetch(`/api/v1/tasks/${requestId}`, { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || `Failed to load task (${res.status})`)
      }
      if (!cancelled) {
        setTask(json?.data ?? null)
      }
    }

    loadTask().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : 'Failed to load task')
      }
    })

    if (!isActiveTask) {
      return () => {
        cancelled = true
      }
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadTask().catch((err) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : 'Failed to load task')
          }
        })
      }
    }, 5000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [requestId, isActiveTask, mode])

  function addReferenceImage() {
    setReferenceImageUrls((current) => current.length < 16 ? [...current, ''] : current)
  }

  function updateReferenceImage(index: number, value: string) {
    setReferenceImageUrls((current) => current.map((url, i) => i === index ? value : url))
  }

  function removeReferenceImage(index: number) {
    setReferenceImageUrls((current) => {
      if (current.length <= 1) return ['']
      return current.filter((_, i) => i !== index)
    })
  }

  useEffect(() => {
    if (editMode) {
      setPrompt(DEFAULT_EDIT_PROMPT)
      if (referenceImageUrls.length === 1 && referenceImageUrls[0] === '') {
        setReferenceImageUrls([DEFAULT_REFERENCE_IMAGE])
      }
    } else {
      setPrompt(DEFAULT_PROMPT)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setTask(null)
    setDirectResult(null)
    setRequestId('')

    try {
      if (mode === 'queue') {
        const keyRes = await fetch('/api/v1/admin/test-api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        const keyJson = await keyRes.json().catch(() => null)
        if (!keyRes.ok) {
          throw new Error(keyJson?.error || 'Failed to create temporary API key')
        }

        const testRawKey = keyJson.data.key as string

        const endpoint = editMode ? '/v1/images/edits' : '/v1/images/generations'
        const body: Record<string, unknown> = {
          prompt: prompt.trim(),
          size,
          metadata: {
            source: 'admin-test-image-page',
            submittedAt: new Date().toISOString(),
          },
        }
        if (editMode) {
          const urls = referenceImageUrls.map((u) => u.trim()).filter(Boolean)
          if (urls.length === 0) {
            throw new Error('At least one reference image URL is required for edit mode')
          }
          body.image = urls
        }

        const submitRes = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${testRawKey}`,
          },
          body: JSON.stringify(body),
        })
        const submitJson = await submitRes.json().catch(() => null)
        if (!submitRes.ok) {
          throw new Error(submitJson?.error || 'Failed to submit task')
        }

        const nextRequestId = submitJson.id as string
        setRequestId(nextRequestId)
        setTask({
          id: nextRequestId,
          prompt: prompt.trim(),
          status: 'QUEUED',
          statusMessage: 'Task submitted',
          errorMessage: null,
          selectedProviderName: null,
          durationMs: null,
          assets: [],
          attempts: [],
          createdAt: new Date().toISOString(),
          completedAt: null,
        })
        return
      }

      if (!selectedProviderId) {
        throw new Error('Please select a provider')
      }

      const directBody: Record<string, unknown> = {
        providerId: selectedProviderId,
        prompt: prompt.trim(),
        size,
      }
      if (editMode) {
        const urls = referenceImageUrls.map((u) => u.trim()).filter(Boolean)
        if (urls.length === 0) {
          throw new Error('At least one reference image URL is required for edit mode')
        }
        directBody.image_urls = urls
      }

      const directRes = await fetch('/api/v1/admin/test-image/direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(directBody),
      })
      const directJson = await directRes.json().catch(() => null)
      if (!directRes.ok) {
        throw new Error(directJson?.error || 'Failed to test provider directly')
      }

      setDirectResult(directJson.data as DirectTestResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit test task')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetBreaker() {
    if (!directResult?.provider.id) {
      return
    }

    setResettingBreaker(true)
    setError('')

    try {
      const res = await fetch(`/api/v1/providers/${directResult.provider.id}/reset-breaker`, {
        method: 'POST',
        credentials: 'include',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to reset breaker')
      }

      setProviders((current) => current.map((provider) => (
        provider.id === directResult.provider.id
          ? {
              ...provider,
              enabled: true,
              cooldownUntil: null,
              circuitBreakerTrippedAt: null,
              circuitBreakerTripReason: null,
            }
          : provider
      )))

      setDirectResult((current) => current ? {
        ...current,
        provider: {
          ...current.provider,
          enabled: true,
          cooldownUntil: null,
          circuitBreakerTrippedAt: null,
          circuitBreakerTripReason: null,
        },
      } : current)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset breaker')
    } finally {
      setResettingBreaker(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Loading...</div></div>
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Test Image</h2>
          <p className="mt-1 text-sm text-gray-500">管理员测试页。既可以测试真实队列提交流程，也可以直接测试单个 provider。支持文生图和图生图。</p>
        </div>
        <Link href="/dashboard/tasks" className="text-sm text-blue-600 hover:text-blue-700">
          View All Tasks
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Test Mode</label>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="mode"
                  value="queue"
                  checked={mode === 'queue'}
                  onChange={() => setMode('queue')}
                />
                Queue test
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="mode"
                  value="direct"
                  checked={mode === 'direct'}
                  onChange={() => setMode('direct')}
                />
                Direct provider test
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Image Type</label>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="editMode"
                  checked={!editMode}
                  onChange={() => setEditMode(false)}
                />
                Text-to-Image (generate)
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="editMode"
                  checked={editMode}
                  onChange={() => setEditMode(true)}
                />
                Image-to-Image (edit)
              </label>
            </div>
          </div>

          {mode === 'direct' && (
            <div className="max-w-xl">
              <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
              <select
                value={selectedProviderId}
                onChange={(e) => setSelectedProviderId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Select a provider</option>
                {providers.map((provider) => {
                  const state = getProviderState(provider)
                  return (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} · {provider.vendor} · {provider.model} · {state}
                    </option>
                  )
                })}
              </select>
              <p className="mt-1 text-xs text-gray-500">Direct mode bypasses internal enqueue/worker and calls the selected provider directly.</p>
            </div>
          )}

          {editMode && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">Reference Image URLs (1-16)</label>
              {referenceImageUrls.map((url, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => updateReferenceImage(index, e.target.value)}
                    placeholder="https://example.com/input-image.png"
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={() => removeReferenceImage(index)}
                    disabled={referenceImageUrls.length <= 1}
                    className="rounded-md border border-gray-200 px-2 py-2 text-sm text-red-500 hover:bg-red-50 disabled:opacity-30"
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addReferenceImage}
                disabled={referenceImageUrls.length >= 16}
                className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-30"
              >
                + Add reference image ({referenceImageUrls.length}/16)
              </button>
              <p className="text-xs text-gray-400">Publicly accessible HTTP/HTTPS image URLs only.</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder="Describe the image to generate"
            />
          </div>

          <div className="max-w-xs">
            <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
            <select
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            >
              <option value="1024x1024">1024x1024</option>
              <option value="1536x1024">1536x1024</option>
              <option value="1024x1536">1024x1536</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting || !prompt.trim() || (mode === 'direct' && !selectedProviderId)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : mode === 'queue' ? 'Submit Queue Test' : 'Run Direct Provider Test'}
            </button>
            {mode === 'queue' && requestId && (
              <span className="text-xs text-gray-500">
                Request ID: <span className="font-mono">{requestId}</span>
              </span>
            )}
          </div>
        </form>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {task && mode === 'queue' && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Latest Queue Test Task</h3>
              <p className="mt-1 text-sm text-gray-500 break-all">{task.prompt}</p>
            </div>
            <div className="text-right">
              <div className={`inline-flex rounded px-2 py-1 text-xs font-medium ${
                task.status === 'SUCCEEDED'
                  ? 'bg-green-100 text-green-800'
                  : task.status === 'FAILED'
                    ? 'bg-red-100 text-red-800'
                    : task.status === 'PROCESSING'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-gray-100 text-gray-800'
              }`}>
                {task.status}
              </div>
              <div className="mt-2 text-xs text-gray-500">{task.statusMessage || '-'}</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Provider</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{task.selectedProviderName || '-'}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Duration</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{formatDuration(task.durationMs)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Attempts</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{task.attempts.length}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Assets</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{task.assets.length}</div>
            </div>
          </div>

          {task.errorMessage && (
            <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {task.errorMessage}
            </div>
          )}

          {task.attempts.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900">Attempts</h4>
              <div className="space-y-2">
                {task.attempts.map((attempt) => (
                  <div key={attempt.id} className="rounded border border-gray-200 p-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-gray-700">
                        Attempt #{attempt.attemptIndex} · {attempt.model}
                      </div>
                      <div className="text-xs text-gray-500">{formatDuration(attempt.durationMs)}</div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{attempt.status}</div>
                    {attempt.errorMessage && <div className="mt-2 text-xs text-red-600">{attempt.errorMessage}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {task.assets.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900">Generated Images</h4>
              <div className="flex flex-wrap gap-4">
                {task.assets.map((asset) => (
                  <a
                    key={asset.id}
                    href={asset.cosUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                  >
                    <img src={asset.cosUrl} alt={asset.id} className="h-48 w-48 object-cover" />
                    <div className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500">
                      {asset.mimeType} · {Math.round(asset.bytes / 1024)} KB
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {directResult && mode === 'direct' && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Direct Provider Test Result</h3>
              <p className="mt-1 text-sm text-gray-500 break-all">{directResult.prompt}</p>
            </div>
            <div className="text-right space-y-2">
              <div className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                SUCCESS
              </div>
              <div>
                <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${providerStateBadgeClass(getProviderState(directResult.provider))}`}>
                  {getProviderState(directResult.provider)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Provider</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{directResult.provider.name}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Model</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{directResult.provider.model}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Mode</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{directResult.mode === 'edit' ? 'Edit (image-to-image)' : 'Generate'}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Duration</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{formatDuration(directResult.durationMs)}</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Image Size</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{formatBytes(directResult.bytes)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">MIME Type</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{directResult.mimeType}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Returned Kind</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{directResult.returnedImageUrlKind}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Ref Images</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{directResult.referenceImageUrls.length}</div>
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
            <div><span className="font-medium">Vendor:</span> {directResult.provider.vendor}</div>
            <div><span className="font-medium">Base URL:</span> {directResult.provider.baseUrl}</div>
            <div><span className="font-medium">Returned kind:</span> {directResult.returnedImageUrlKind}</div>
            <div><span className="font-medium">MIME type:</span> {directResult.mimeType}</div>
            {directResult.provider.circuitBreakerTripReason && (
              <div className="text-red-700"><span className="font-medium">Trip reason:</span> {directResult.provider.circuitBreakerTripReason}</div>
            )}
            {directResult.upstreamImageUrl && (
              <div className="break-all"><span className="font-medium">Upstream URL:</span> {directResult.upstreamImageUrl}</div>
            )}
          </div>

          {directResult.referenceImageUrls.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900">Reference Images</h4>
              <div className="flex flex-wrap gap-3">
                {directResult.referenceImageUrls.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                  >
                    <img src={url} alt={`Reference ${index + 1}`} className="h-32 w-32 object-cover" />
                    <div className="border-t border-gray-200 px-2 py-1 text-xs text-gray-500">#{index + 1}</div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {(getProviderState(directResult.provider) === 'TRIPPED' || getProviderState(directResult.provider) === 'DISABLED') && (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleResetBreaker}
                disabled={resettingBreaker}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {resettingBreaker ? 'Resetting...' : 'Reset breaker'}
              </button>
              <span className="text-xs text-gray-500">Test succeeded. You can manually restore this provider to service.</span>
            </div>
          )}

          {directResult.revisedPrompt !== directResult.prompt && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900">Revised Prompt</h4>
              <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
                {directResult.revisedPrompt}
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-900">Generated Image</h4>
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 inline-block">
              <img
                src={`data:${directResult.mimeType};base64,${directResult.imageBase64}`}
                alt="Direct provider test result"
                className="max-h-[32rem] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
