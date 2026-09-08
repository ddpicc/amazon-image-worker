'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser } from '@/lib/dashboard/auth'
import { SIZE_OPTIONS } from '@/lib/image-options'
import { taskStatusLabel, useDashboardI18n } from '@/lib/dashboard/i18n'

type TaskStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
type TestMode = 'queue' | 'direct'
type ApiExecutionMode = 'async' | 'sync'

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

interface SyncApiResult {
  id: string
  created: number
  object: string
  model: string
  size?: string
  idempotent?: boolean
  usage?: {
    sku?: string
    unit_price?: number
    unit_price_fen?: number
    price_version?: number
    cost?: number
    cost_fen?: number
    cost_status?: string
    currency?: string
  }
  task?: {
    id: string
    status: string
  }
  data: Array<{
    url: string
    revised_prompt?: string
  }>
}

interface SyncApiErrorResult {
  status: number
  error: string
  code?: string
  request_id?: string
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

const DEFAULT_PROMPT = 'A premium red ceramic coffee mug on a light oak table, soft morning window light, clean minimal composition, realistic product photography, no text, no logo, square image.'
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
  const { lang } = useDashboardI18n()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [size, setSize] = useState('1024x1024')
  const [mode, setMode] = useState<TestMode>('queue')
  const [apiExecutionMode, setApiExecutionMode] = useState<ApiExecutionMode>('async')
  const [editMode, setEditMode] = useState(false)
  const [referenceImageUrls, setReferenceImageUrls] = useState<string[]>([''])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [selectedProviderId, setSelectedProviderId] = useState('')
  const [requestId, setRequestId] = useState('')
  const [task, setTask] = useState<TaskDetail | null>(null)
  const [syncResult, setSyncResult] = useState<SyncApiResult | null>(null)
  const [syncErrorResult, setSyncErrorResult] = useState<SyncApiErrorResult | null>(null)
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
          throw new Error(json?.error || (lang === 'zh' ? `加载供应商失败（${res.status}）` : `Failed to load providers (${res.status})`))
        }

        const nextProviders = json?.data || []
        if (!cancelled) {
          setProviders(nextProviders)
          setSelectedProviderId((current) => current || nextProviders[0]?.id || '')
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : (lang === 'zh' ? '加载供应商失败' : 'Failed to load providers'))
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
        throw new Error(json?.error || (lang === 'zh' ? `加载任务失败（${res.status}）` : `Failed to load task (${res.status})`))
      }
      if (!cancelled) {
        setTask(json?.data ?? null)
      }
    }

    loadTask().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : (lang === 'zh' ? '加载任务失败' : 'Failed to load task'))
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
            setError(err instanceof Error ? err.message : (lang === 'zh' ? '加载任务失败' : 'Failed to load task'))
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

  const providerStateLabel = (state: ReturnType<typeof getProviderState>) => {
    switch (state) {
      case 'TRIPPED':
        return lang === 'zh' ? '已熔断' : 'Tripped'
      case 'DISABLED':
        return lang === 'zh' ? '已禁用' : 'Disabled'
      case 'COOLDOWN':
        return lang === 'zh' ? '冷却中' : 'Cooldown'
      default:
        return lang === 'zh' ? '可用' : 'Enabled'
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    setTask(null)
    setSyncResult(null)
    setSyncErrorResult(null)
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
          throw new Error(keyJson?.error || (lang === 'zh' ? '创建临时 API Key 失败' : 'Failed to create temporary API key'))
        }

        const testRawKey = keyJson.data.key as string

        const endpoint = mode === 'queue'
          ? apiExecutionMode === 'async'
            ? (editMode ? '/v1/async/images/edits' : '/v1/async/images/generations')
            : (editMode ? '/v1/images/edits' : '/v1/images/generations')
          : ''
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
            throw new Error(lang === 'zh' ? '图生图模式至少需要一张参考图 URL' : 'At least one reference image URL is required for edit mode')
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
          if (apiExecutionMode === 'sync') {
            setSyncErrorResult({
              status: submitRes.status,
              error: submitJson?.error || (lang === 'zh' ? '同步 API 请求失败' : 'Sync API request failed'),
              code: submitJson?.code,
              request_id: submitJson?.request_id,
            })
          }
          throw new Error(submitJson?.error || (lang === 'zh' ? '提交任务失败' : 'Failed to submit task'))
        }

        if (apiExecutionMode === 'sync') {
          setSyncResult(submitJson as SyncApiResult)
          return
        }

        const nextRequestId = submitJson.id as string
        setRequestId(nextRequestId)
        setTask({
          id: nextRequestId,
          prompt: prompt.trim(),
          status: 'QUEUED',
          statusMessage: lang === 'zh' ? '任务已提交' : 'Task submitted',
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
        throw new Error(lang === 'zh' ? '请选择供应商' : 'Please select a provider')
      }

      const directBody: Record<string, unknown> = {
        providerId: selectedProviderId,
        prompt: prompt.trim(),
        size,
      }
      if (editMode) {
        const urls = referenceImageUrls.map((u) => u.trim()).filter(Boolean)
        if (urls.length === 0) {
          throw new Error(lang === 'zh' ? '图生图模式至少需要一张参考图 URL' : 'At least one reference image URL is required for edit mode')
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
        throw new Error(directJson?.error || (lang === 'zh' ? '直连测试供应商失败' : 'Failed to test provider directly'))
      }

      setDirectResult(directJson.data as DirectTestResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'zh' ? '提交测试任务失败' : 'Failed to submit test task'))
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
        throw new Error(json?.error || (lang === 'zh' ? '重置熔断器失败' : 'Failed to reset breaker'))
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
      setError(err instanceof Error ? err.message : (lang === 'zh' ? '重置熔断器失败' : 'Failed to reset breaker'))
    } finally {
      setResettingBreaker(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">{lang === 'zh' ? '加载中...' : 'Loading...'}</div></div>
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{lang === 'zh' ? '测试生图' : 'Test Image'}</h2>
          <p className="mt-1 text-sm text-gray-500">{lang === 'zh' ? '管理员测试页。既可以测试真实队列提交流程，也可以直接测试单个 provider。支持文生图和图生图。' : 'Admin testing page for both real queue submissions and direct provider calls. Supports text-to-image and image-to-image.'}</p>
        </div>
        <Link href="/dashboard/tasks" className="text-sm text-blue-600 hover:text-blue-700">
          {lang === 'zh' ? '查看全部任务' : 'View All Tasks'}
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{lang === 'zh' ? '测试模式' : 'Test Mode'}</label>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="mode"
                  value="queue"
                  checked={mode === 'queue'}
                  onChange={() => setMode('queue')}
                />
                {lang === 'zh' ? '队列测试' : 'Queue test'}
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="mode"
                  value="direct"
                  checked={mode === 'direct'}
                  onChange={() => setMode('direct')}
                />
                {lang === 'zh' ? '直连 Provider 测试' : 'Direct provider test'}
              </label>
            </div>
          </div>

          {mode === 'queue' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{lang === 'zh' ? 'API 模式' : 'API Mode'}</label>
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="apiExecutionMode"
                    value="async"
                    checked={apiExecutionMode === 'async'}
                    onChange={() => setApiExecutionMode('async')}
                  />
                  {lang === 'zh' ? '异步 API（/v1/async/images/*）' : 'Async API (/v1/async/images/*)'}
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="apiExecutionMode"
                    value="sync"
                    checked={apiExecutionMode === 'sync'}
                    onChange={() => setApiExecutionMode('sync')}
                  />
                  {lang === 'zh' ? '同步 API（/v1/images/*）' : 'Sync API (/v1/images/*)'}
                </label>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {apiExecutionMode === 'async'
                  ? (lang === 'zh' ? '异步模式会返回 task id，并自动轮询任务详情。' : 'Async mode returns a task id and auto-polls task details.')
                  : (lang === 'zh' ? '同步模式会直接返回图片结果；若命中 provider 失败会返回 520。' : 'Sync mode returns the final image directly and may return 520 on provider failure.')}
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">{lang === 'zh' ? '图片类型' : 'Image Type'}</label>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="editMode"
                  checked={!editMode}
                  onChange={() => setEditMode(false)}
                />
                {lang === 'zh' ? '文生图（generate）' : 'Text-to-Image (generate)'}
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="editMode"
                  checked={editMode}
                  onChange={() => setEditMode(true)}
                />
                {lang === 'zh' ? '图生图（edit）' : 'Image-to-Image (edit)'}
              </label>
            </div>
          </div>

          {mode === 'direct' && (
            <div className="max-w-xl">
              <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'zh' ? '供应商' : 'Provider'}</label>
              <select
                value={selectedProviderId}
                onChange={(e) => setSelectedProviderId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">{lang === 'zh' ? '选择一个供应商' : 'Select a provider'}</option>
                {providers.map((provider) => {
                  const state = getProviderState(provider)
                  return (
                    <option key={provider.id} value={provider.id}>
                      {provider.name} · {provider.vendor} · {provider.model} · {providerStateLabel(state)}
                    </option>
                  )
                })}
              </select>
              <p className="mt-1 text-xs text-gray-500">{lang === 'zh' ? '直连模式会绕过内部队列和 Worker，可测试正常、冷却、禁用或已熔断的供应商；测试成功后可在结果中一键激活。' : 'Direct mode bypasses the queue and Worker. It can test enabled, cooling, disabled, or tripped providers; successful tests can restore service in one click.'}</p>
            </div>
          )}

          {editMode && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">{lang === 'zh' ? '参考图 URL（1-16）' : 'Reference Image URLs (1-16)'}</label>
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
                    title={lang === 'zh' ? '移除' : 'Remove'}
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
                {lang === 'zh' ? `+ 添加参考图（${referenceImageUrls.length}/16）` : `+ Add reference image (${referenceImageUrls.length}/16)`}
              </button>
              <p className="text-xs text-gray-400">{lang === 'zh' ? '仅支持可公开访问的 HTTP/HTTPS 图片 URL。' : 'Publicly accessible HTTP/HTTPS image URLs only.'}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'zh' ? '提示词' : 'Prompt'}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              placeholder={lang === 'zh' ? '描述你要生成的图片' : 'Describe the image to generate'}
            />
          </div>

          <div className="max-w-lg">
            <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'zh' ? '尺寸' : 'Size'}</label>
            <input
              list="admin-image-size-options"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="1536x1024"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <datalist id="admin-image-size-options">
              {SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value} />
              ))}
            </datalist>
            <p className="mt-2 text-xs text-gray-500">
              {lang === 'zh'
                ? '省略时默认 1024x1024。也可输入符合官方 GPT-Image-2 约束的尺寸：宽高均为 16 的倍数，最长边不超过 3840，比例不超过 3:1，总像素 655,360–8,294,400。比例字符串（如 5:3）不能直接传。'
                : 'Omitting size defaults to 1024x1024. You can enter any official GPT-Image-2 resolution: both dimensions divisible by 16, max edge 3840, aspect ratio at most 3:1, and 655,360–8,294,400 total pixels. Ratio strings such as 5:3 are not accepted.'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting || !prompt.trim() || (mode === 'direct' && !selectedProviderId)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting
                ? (lang === 'zh' ? '提交中...' : 'Submitting...')
                : mode === 'queue'
                  ? apiExecutionMode === 'async'
                    ? (lang === 'zh' ? '提交异步 API 测试' : 'Submit Async API Test')
                    : (lang === 'zh' ? '提交同步 API 测试' : 'Submit Sync API Test')
                  : (lang === 'zh' ? '运行直连 Provider 测试' : 'Run Direct Provider Test')}
            </button>
            {mode === 'queue' && apiExecutionMode === 'async' && requestId && (
              <span className="text-xs text-gray-500">
                {lang === 'zh' ? '请求 ID：' : 'Request ID: '}<span className="font-mono">{requestId}</span>
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
              <h3 className="text-lg font-semibold text-gray-900">{lang === 'zh' ? '最新队列测试任务' : 'Latest Queue Test Task'}</h3>
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
                {taskStatusLabel(lang, task.status)}
              </div>
              <div className="mt-2 text-xs text-gray-500">{task.statusMessage || '-'}</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '供应商' : 'Provider'}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{task.selectedProviderName || '-'}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '耗时' : 'Duration'}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{formatDuration(task.durationMs)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '尝试次数' : 'Attempts'}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{task.attempts.length}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '图片数' : 'Assets'}</div>
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
              <h4 className="mb-2 text-sm font-medium text-gray-900">{lang === 'zh' ? '尝试记录' : 'Attempts'}</h4>
              <div className="space-y-2">
                {task.attempts.map((attempt) => (
                  <div key={attempt.id} className="rounded border border-gray-200 p-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div className="text-gray-700">
                        {lang === 'zh' ? `第 ${attempt.attemptIndex} 次尝试` : `Attempt #${attempt.attemptIndex}`} · {attempt.model}
                      </div>
                      <div className="text-xs text-gray-500">{formatDuration(attempt.durationMs)}</div>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">{taskStatusLabel(lang, attempt.status === 'STARTED' ? 'PROCESSING' : attempt.status)}</div>
                    {attempt.errorMessage && <div className="mt-2 text-xs text-red-600">{attempt.errorMessage}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {task.assets.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900">{lang === 'zh' ? '生成图片' : 'Generated Images'}</h4>
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

      {syncResult && mode === 'queue' && apiExecutionMode === 'sync' && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{lang === 'zh' ? '最新同步 API 结果' : 'Latest Sync API Result'}</h3>
              <p className="mt-1 text-sm text-gray-500">
                {lang === 'zh' ? '同步接口直接返回最终结果和内部 task 信息。' : 'Sync API returns the final result directly with persisted task metadata.'}
              </p>
            </div>
            <div className="text-right">
              <div className="inline-flex rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                {syncResult.task?.status || 'completed'}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {lang === 'zh' ? '请求 ID：' : 'Request ID: '}<span className="font-mono">{syncResult.id}</span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Object</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{syncResult.object}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '模型' : 'Model'}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{syncResult.model}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '尺寸' : 'Size'}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{syncResult.size || '-'}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">Idempotent</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{String(Boolean(syncResult.idempotent))}</div>
            </div>
          </div>

          {syncResult.usage && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">SKU</div>
                <div className="mt-1 text-sm font-medium text-gray-900">{syncResult.usage.sku || '-'}</div>
              </div>
              <div className="rounded border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">{lang === 'zh' ? '费用' : 'Cost'}</div>
                <div className="mt-1 text-sm font-medium text-gray-900">
                  {syncResult.usage.cost ?? '-'} {syncResult.usage.currency || ''}
                </div>
              </div>
              <div className="rounded border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">{lang === 'zh' ? '计费状态' : 'Cost Status'}</div>
                <div className="mt-1 text-sm font-medium text-gray-900">{syncResult.usage.cost_status || '-'}</div>
              </div>
              <div className="rounded border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs text-gray-500">Task</div>
                <div className="mt-1 text-sm font-medium text-gray-900">{syncResult.task?.id || syncResult.id}</div>
              </div>
            </div>
          )}

          {syncResult.data.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900">{lang === 'zh' ? '生成图片' : 'Generated Images'}</h4>
              <div className="flex flex-wrap gap-4">
                {syncResult.data.map((asset, index) => (
                  <a
                    key={`${asset.url}-${index}`}
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                  >
                    <img src={asset.url} alt={asset.revised_prompt || asset.url} className="h-48 w-48 object-cover" />
                    <div className="border-t border-gray-200 px-3 py-2 text-xs text-gray-500">
                      #{index + 1}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {syncResult.data.some((item) => item.revised_prompt) && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900">{lang === 'zh' ? '修订后的提示词' : 'Revised Prompt'}</h4>
              <div className="space-y-2">
                {syncResult.data.map((item, index) => item.revised_prompt ? (
                  <div key={`revised-${index}`} className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
                    {item.revised_prompt}
                  </div>
                ) : null)}
              </div>
            </div>
          )}
        </div>
      )}

      {syncErrorResult && mode === 'queue' && apiExecutionMode === 'sync' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-amber-950">{lang === 'zh' ? '同步 API 失败结果' : 'Sync API Failure Result'}</h3>
              <p className="mt-1 text-sm text-amber-900/80">
                {lang === 'zh'
                  ? '这里会展示同步 API 的错误码、request_id 和建议重试信息，便于验证 520 链路。'
                  : 'This panel highlights sync API failures, including status code, request_id, and retry guidance for 520 validation.'}
              </p>
            </div>
            <div className="rounded bg-amber-200 px-2 py-1 text-xs font-medium text-amber-950">
              HTTP {syncErrorResult.status}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-amber-200 bg-white/70 p-3">
              <div className="text-xs text-amber-800">HTTP Status</div>
              <div className="mt-1 text-sm font-medium text-amber-950">{syncErrorResult.status}</div>
            </div>
            <div className="rounded border border-amber-200 bg-white/70 p-3">
              <div className="text-xs text-amber-800">Code</div>
              <div className="mt-1 text-sm font-medium text-amber-950">{syncErrorResult.code || '-'}</div>
            </div>
            <div className="rounded border border-amber-200 bg-white/70 p-3 sm:col-span-2">
              <div className="text-xs text-amber-800">Request ID</div>
              <div className="mt-1 break-all font-mono text-sm font-medium text-amber-950">{syncErrorResult.request_id || '-'}</div>
            </div>
          </div>

          <div className="rounded border border-amber-200 bg-white/70 p-4 text-sm text-amber-950">
            <div className="font-medium">{lang === 'zh' ? '错误信息' : 'Error Message'}</div>
            <div className="mt-2 whitespace-pre-wrap">{syncErrorResult.error}</div>
          </div>

          {syncErrorResult.status === 520 && (
            <div className="rounded border border-amber-300 bg-amber-100 px-4 py-3 text-sm text-amber-950">
              {lang === 'zh'
                ? '这是预期的同步单 Provider 失败链路。请直接重试同一请求，系统会重新选择 Provider。'
                : 'This is the expected sync single-provider failure path. Retry the same request to trigger a fresh provider selection.'}
            </div>
          )}
        </div>
      )}

      {directResult && mode === 'direct' && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{lang === 'zh' ? '直连供应商测试结果' : 'Direct Provider Test Result'}</h3>
              <p className="mt-1 text-sm text-gray-500 break-all">{directResult.prompt}</p>
            </div>
            <div className="text-right space-y-2">
              <div className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                {lang === 'zh' ? '成功' : 'SUCCESS'}
              </div>
              <div>
                <span className={`inline-flex rounded px-2 py-1 text-xs font-medium ${providerStateBadgeClass(getProviderState(directResult.provider))}`}>
                  {providerStateLabel(getProviderState(directResult.provider))}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '供应商' : 'Provider'}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{directResult.provider.name}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '模型' : 'Model'}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{directResult.provider.model}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '模式' : 'Mode'}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{directResult.mode === 'edit' ? (lang === 'zh' ? '图生图' : 'Edit (image-to-image)') : (lang === 'zh' ? '文生图' : 'Generate')}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '耗时' : 'Duration'}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{formatDuration(directResult.durationMs)}</div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '图片大小' : 'Image Size'}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{formatBytes(directResult.bytes)}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">MIME Type</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{directResult.mimeType}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '返回类型' : 'Returned Kind'}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{directResult.returnedImageUrlKind}</div>
            </div>
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="text-xs text-gray-500">{lang === 'zh' ? '参考图数量' : 'Ref Images'}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{directResult.referenceImageUrls.length}</div>
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 space-y-1">
            <div><span className="font-medium">{lang === 'zh' ? '厂商：' : 'Vendor:'}</span> {directResult.provider.vendor}</div>
            <div><span className="font-medium">{lang === 'zh' ? 'Base URL：' : 'Base URL:'}</span> {directResult.provider.baseUrl}</div>
            <div><span className="font-medium">{lang === 'zh' ? '返回类型：' : 'Returned kind:'}</span> {directResult.returnedImageUrlKind}</div>
            <div><span className="font-medium">{lang === 'zh' ? 'MIME 类型：' : 'MIME type:'}</span> {directResult.mimeType}</div>
            {directResult.provider.circuitBreakerTripReason && (
              <div className="text-red-700"><span className="font-medium">{lang === 'zh' ? '熔断原因：' : 'Trip reason:'}</span> {directResult.provider.circuitBreakerTripReason}</div>
            )}
            {directResult.upstreamImageUrl && (
              <div className="break-all"><span className="font-medium">{lang === 'zh' ? '上游图片 URL：' : 'Upstream URL:'}</span> {directResult.upstreamImageUrl}</div>
            )}
          </div>

          {directResult.referenceImageUrls.length > 0 && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900">{lang === 'zh' ? '参考图' : 'Reference Images'}</h4>
              <div className="flex flex-wrap gap-3">
                {directResult.referenceImageUrls.map((url, index) => (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
                  >
                    <img src={url} alt={lang === 'zh' ? `参考图 ${index + 1}` : `Reference ${index + 1}`} className="h-32 w-32 object-cover" />
                    <div className="border-t border-gray-200 px-2 py-1 text-xs text-gray-500">#{index + 1}</div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {(getProviderState(directResult.provider) === 'TRIPPED' || getProviderState(directResult.provider) === 'DISABLED' || getProviderState(directResult.provider) === 'COOLDOWN') && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <button
                type="button"
                onClick={handleResetBreaker}
                disabled={resettingBreaker}
                className="min-h-11 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {resettingBreaker ? (lang === 'zh' ? '激活中...' : 'Activating...') : (lang === 'zh' ? '一键激活供应商' : 'Activate provider')}
              </button>
              <span className="text-xs text-emerald-800">{lang === 'zh' ? '测试成功。激活会清除熔断和冷却状态，使供应商重新参与路由。' : 'Test succeeded. Activation clears breaker and cooldown state so the provider can rejoin routing.'}</span>
            </div>
          )}

          {directResult.revisedPrompt !== directResult.prompt && (
            <div>
              <h4 className="mb-2 text-sm font-medium text-gray-900">{lang === 'zh' ? '修订后的提示词' : 'Revised Prompt'}</h4>
              <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700 whitespace-pre-wrap">
                {directResult.revisedPrompt}
              </div>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-sm font-medium text-gray-900">{lang === 'zh' ? '生成结果' : 'Generated Image'}</h4>
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50 inline-block">
              <img
                src={`data:${directResult.mimeType};base64,${directResult.imageBase64}`}
                alt={lang === 'zh' ? '直连供应商测试结果' : 'Direct provider test result'}
                className="max-h-[32rem] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
