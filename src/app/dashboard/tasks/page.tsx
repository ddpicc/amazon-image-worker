'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/dashboard/auth'
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'

type TaskStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

interface Task {
  id: string
  prompt: string
  status: TaskStatus
  selectedProviderName: string | null
  durationMs: number | null
  createdAt: string
  errorMessage: string | null
  attempts: TaskAttempt[]
  assets: TaskAsset[]
}

interface TaskAttempt {
  id: string
  providerId: string | null
  baseUrl: string
  model: string
  attemptIndex: number
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED'
  durationMs: number | null
  errorMessage: string | null
  errorType: string | null
  startedAt: string
  completedAt: string | null
}

interface TaskAsset {
  id: string
  cosUrl: string
  mimeType: string
  bytes: number
  createdAt: string
}

interface TasksResponse {
  tasks: Task[]
  total: number
  page: number
  limit: number
  totalPages: number
}

const STATUS_TABS: { label: string; value: TaskStatus | 'ALL' }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Queued', value: 'QUEUED' },
  { label: 'Processing', value: 'PROCESSING' },
  { label: 'Succeeded', value: 'SUCCEEDED' },
  { label: 'Failed', value: 'FAILED' },
]

function StatusBadge({ status }: { status: TaskStatus }) {
  const styles: Record<TaskStatus, string> = {
    QUEUED: 'bg-gray-100 text-gray-800',
    PROCESSING: 'bg-yellow-100 text-yellow-800',
    SUCCEEDED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>
      {status}
    </span>
  )
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

function formatDuration(ms: number | null): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function TasksPage() {
  const router = useRouter()
  const [data, setData] = useState<TasksResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const limit = 20

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      const res = await fetch(`/api/v1/tasks?${params}`)
      if (res.status === 401) {
        router.push('/dashboard/login')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setError('')
    } catch {
      setError('Failed to load tasks')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, router])

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/dashboard/login')
      return
    }
    fetchTasks()
  }, [fetchTasks, router])

  function handleTabChange(value: TaskStatus | 'ALL') {
    setStatusFilter(value)
    setPage(1)
    setExpandedId(null)
  }

  async function handleRetry(task: Task) {
    alert('Dashboard admin retry is not wired yet. Please retry using the API key client flow.')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading tasks...</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Tasks</h2>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => handleTabChange(tab.value)}
            className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      {/* Tasks table */}
      <div className="rounded-lg shadow-sm border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2.5 font-medium w-8"></th>
                <th className="px-4 py-2.5 font-medium">ID</th>
                <th className="px-4 py-2.5 font-medium">Prompt</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Provider</th>
                <th className="px-4 py-2.5 font-medium">Duration</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {!data || data.tasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No tasks found
                  </td>
                </tr>
              ) : (
                data.tasks.map((task, i) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    i={i}
                    expanded={expandedId === task.id}
                    onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
                    onRetry={handleRetry}
                    retrying={false}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">
            Page {data.page} of {data.totalPages} ({data.total} total)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(Math.min(data.totalPages, page + 1))}
              disabled={page >= data.totalPages}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  i,
  expanded,
  onToggle,
  onRetry,
  retrying,
}: {
  task: Task
  i: number
  expanded: boolean
  onToggle: () => void
  onRetry: (t: Task) => void
  retrying: boolean
}) {
  return (
    <>
      <tr
        className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50 cursor-pointer`}
        onClick={onToggle}
      >
        <td className="px-4 py-2.5">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-400" />
          )}
        </td>
        <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{task.id.slice(0, 8)}</td>
        <td className="px-4 py-2.5 text-gray-700 max-w-[200px] truncate">{task.prompt}</td>
        <td className="px-4 py-2.5">
          <StatusBadge status={task.status} />
        </td>
        <td className="px-4 py-2.5 text-gray-600">{task.selectedProviderName || '-'}</td>
        <td className="px-4 py-2.5 text-gray-600">{formatDuration(task.durationMs)}</td>
        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">
          {formatDate(task.createdAt)}
        </td>
      </tr>
      {expanded && (
        <tr className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
          <td colSpan={7} className="px-4 py-4 bg-gray-50">
            <div className="space-y-4 ml-4">
              {/* Full prompt */}
              <div>
                <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">Prompt</h4>
                <p className="text-sm text-gray-800 bg-white rounded border border-gray-200 p-3 whitespace-pre-wrap">
                  {task.prompt}
                </p>
              </div>

              {/* Attempts timeline */}
              {task.attempts && task.attempts.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">
                    Attempts ({task.attempts.length})
                  </h4>
                  <div className="space-y-2">
                    {task.attempts.map((attempt) => (
                      <div
                        key={attempt.id}
                        className="bg-white rounded border border-gray-200 p-3 text-sm"
                      >
                        <div className="flex items-center gap-3 text-gray-600">
                          <span className="font-medium">#{attempt.attemptIndex + 1}</span>
                          <span>{attempt.model}</span>
                          <StatusBadge
                            status={
                              attempt.status === 'STARTED'
                                ? 'PROCESSING'
                                : attempt.status === 'SUCCEEDED'
                                  ? 'SUCCEEDED'
                                  : 'FAILED'
                            }
                          />
                          <span className="text-xs text-gray-400">
                            {formatDuration(attempt.durationMs)}
                          </span>
                        </div>
                        {attempt.errorMessage && (
                          <p className="mt-1 text-xs text-red-600">{attempt.errorMessage}</p>
                        )}
                        {attempt.errorType && (
                          <p className="mt-0.5 text-xs text-orange-600">
                            Type: {attempt.errorType}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Generated images */}
              {task.assets && task.assets.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">
                    Generated Images
                  </h4>
                  <div className="flex flex-wrap gap-3">
                    {task.assets.map((asset) => (
                      <a
                        key={asset.id}
                        href={asset.cosUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <img
                          src={asset.cosUrl}
                          alt={`Generated image ${asset.id.slice(0, 8)}`}
                          className="w-32 h-32 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity"
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Retry button for failed tasks */}
              {task.status === 'FAILED' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    onRetry(task)
                  }}
                  disabled={retrying}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {retrying ? 'Retrying...' : 'Retry'}
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
