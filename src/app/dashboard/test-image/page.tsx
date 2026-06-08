'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser } from '@/lib/dashboard/auth'

type TaskStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

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

const DEFAULT_PROMPT = 'A premium ecommerce studio photo of a ceramic mug with soft shadow and clean white background'

function formatDuration(ms: number | null): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function AdminTestImagePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [size, setSize] = useState('1024x1024')
  const [requestId, setRequestId] = useState('')
  const [task, setTask] = useState<TaskDetail | null>(null)
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
    if (!requestId) {
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
  }, [requestId, isActiveTask])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    let tempKeyId = ''
    let tempRawKey = ''

    try {
      const keyRes = await fetch('/api/v1/admin/test-api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Admin Test Key ${new Date().toISOString()}` }),
      })
      const keyJson = await keyRes.json().catch(() => null)
      if (!keyRes.ok) {
        throw new Error(keyJson?.error || 'Failed to create temporary API key')
      }

      tempKeyId = keyJson.data.id
      tempRawKey = keyJson.data.key

      const submitRes = await fetch('/api/v1/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tempRawKey}`,
        },
        body: JSON.stringify({
          prompt: prompt.trim(),
          size,
          metadata: {
            source: 'admin-test-image-page',
            submittedAt: new Date().toISOString(),
          },
        }),
      })
      const submitJson = await submitRes.json().catch(() => null)
      if (!submitRes.ok) {
        throw new Error(submitJson?.error || 'Failed to submit task')
      }

      const nextRequestId = submitJson.requestId as string
      setRequestId(nextRequestId)
      setTask({
        id: nextRequestId,
        prompt: prompt.trim(),
        status: submitJson.status as TaskStatus,
        statusMessage: submitJson.statusMessage ?? 'Task submitted',
        errorMessage: null,
        selectedProviderName: null,
        durationMs: null,
        assets: [],
        attempts: [],
        createdAt: new Date().toISOString(),
        completedAt: null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit test task')
    } finally {
      if (tempKeyId) {
        await fetch('/api/v1/admin/test-api-key', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: tempKeyId }),
        }).catch(() => undefined)
      }
      setSubmitting(false)
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
          <p className="mt-1 text-sm text-gray-500">管理员测试页。实际调用 `POST /api/v1/tasks` 提交任务，再用管理员会话查看结果。</p>
        </div>
        <Link href="/dashboard/tasks" className="text-sm text-blue-600 hover:text-blue-700">
          View All Tasks
        </Link>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-4">
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
              disabled={submitting || !prompt.trim()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Test Task'}
            </button>
            {requestId && (
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

      {task && (
        <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Latest Test Task</h3>
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
    </div>
  )
}
