'use client'

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'
import { paymentStatusLabel, taskStatusLabel, useDashboardI18n, type DashboardLanguage } from '@/lib/dashboard/i18n'

type TaskStatus = 'STARTED' | 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

type ActivityTab = 'tasks' | 'usage'

interface ActivityTask {
  id: string
  status: TaskStatus
  durationMs: number | null
  createdAt: string
  apiKey?: { id: string; name: string; keyPrefix: string } | null
  assets?: TaskAsset[]
  _count?: {
    attempts: number
    assets: number
    webhookDeliveries?: number
  }
}

interface TaskAsset {
  id: string
  cosUrl: string
  mimeType: string
  bytes: number
  createdAt: string
}

interface TasksResponse {
  tasks: ActivityTask[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface UsageRow {
  id: string
  size: string | null
  pricingSku: string | null
  unitPrice: number | null
  priceVersion: number | null
  cost: number | null
  costStatus: string | null
  status: string
  createdAt: string
  apiKeyId: string
  apiKeyName: string
}

interface ApiKeyOption {
  id: string
  name: string
  keyPrefix: string
}

function StatusBadge({ status, lang }: { status: TaskStatus; lang: DashboardLanguage }) {
  const styles: Record<TaskStatus, string> = {
    STARTED: 'bg-blue-100 text-blue-800',
    QUEUED: 'bg-gray-100 text-gray-800',
    PROCESSING: 'bg-yellow-100 text-yellow-800',
    SUCCEEDED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
  }

  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${styles[status]}`}>{taskStatusLabel(lang, status)}</span>
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}

function formatDuration(ms: number | null) {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export default function ActivityPage() {
  const router = useRouter()
  const { lang, t } = useDashboardI18n()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [activeTab, setActiveTab] = useState<ActivityTab>('tasks')
  const [tasksData, setTasksData] = useState<TasksResponse | null>(null)
  const [taskDetails, setTaskDetails] = useState<Record<string, ActivityTask>>({})
  const [taskDetailLoadingId, setTaskDetailLoadingId] = useState<string | null>(null)
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [tasksLoading, setTasksLoading] = useState(true)
  const [usageRows, setUsageRows] = useState<UsageRow[]>([])
  const [apiKeys, setApiKeys] = useState<ApiKeyOption[]>([])
  const [usageLoading, setUsageLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL')
  const [tasksPage, setTasksPage] = useState(1)
  const [selectedApiKeyId, setSelectedApiKeyId] = useState('ALL')
  const [error, setError] = useState('')
  const statusTabs: Array<{ label: string; value: TaskStatus | 'ALL' }> = [
    { label: t('taskTabAll'), value: 'ALL' },
    { label: t('taskTabQueued'), value: 'QUEUED' },
    { label: t('taskTabProcessing'), value: 'PROCESSING' },
    { label: t('taskTabSucceeded'), value: 'SUCCEEDED' },
    { label: t('taskTabFailed'), value: 'FAILED' },
  ]
  const hasActiveTasks = tasksData?.tasks.some((task) => task.status === 'QUEUED' || task.status === 'PROCESSING') ?? false

  const loadTasks = useCallback(async (showLoading = true) => {
    if (showLoading) {
      setTasksLoading(true)
    }
    try {
      const params = new URLSearchParams({ page: String(tasksPage), limit: '20' })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      const res = await fetch(`/api/v1/tasks?${params.toString()}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (res.status === 401) {
        router.push('/dashboard/login')
        return
      }
      if (res.status === 403) {
        router.push('/dashboard')
        return
      }
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || (lang === 'zh' ? '加载任务失败' : 'Failed to load tasks'))
      setTasksData(body)
      setTaskDetails({})
      setExpandedTaskId(null)
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'zh' ? '加载任务失败' : 'Failed to load tasks'))
    } finally {
      setTasksLoading(false)
    }
  }, [router, statusFilter, tasksPage])

  const loadUsage = useCallback(async () => {
    setUsageLoading(true)
    try {
      const usageParams = new URLSearchParams({ limit: '100' })
      if (selectedApiKeyId !== 'ALL') usageParams.set('apiKeyId', selectedApiKeyId)

      const [usageRes, keysRes] = await Promise.all([
        fetch(`/api/v1/usage?${usageParams.toString()}`, { credentials: 'include', cache: 'no-store' }),
        fetch('/api/v1/api-keys', { credentials: 'include', cache: 'no-store' }),
      ])

      if ([usageRes, keysRes].some((res) => res.status === 401)) {
        router.push('/dashboard/login')
        return
      }

      const usageBody = await usageRes.json().catch(() => ({}))
      const keysBody = await keysRes.json().catch(() => ({}))
      if (!usageRes.ok) throw new Error(usageBody.error || (lang === 'zh' ? '加载用量失败' : 'Failed to load usage'))
      if (!keysRes.ok) throw new Error(keysBody.error || (lang === 'zh' ? '加载 API 密钥失败' : 'Failed to load API keys'))

      setUsageRows(usageBody.records || [])
      setApiKeys(keysBody.keys || [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'zh' ? '加载用量失败' : 'Failed to load usage'))
    } finally {
      setUsageLoading(false)
    }
  }, [router, selectedApiKeyId])

  useEffect(() => {
    let mounted = true
    fetchCurrentUser().then((currentUser) => {
      if (!mounted) return
      if (!currentUser) {
        router.push('/dashboard/login')
        return
      }
      if (currentUser.role === 'ADMIN') {
        router.push('/dashboard/tasks')
        return
      }
      setUser(currentUser)
    })
    return () => {
      mounted = false
    }
  }, [router])

  useEffect(() => {
    if (!user) return
    loadTasks()
  }, [user, loadTasks])

  useEffect(() => {
    if (!user) return
    loadUsage()
  }, [user, loadUsage])

  useEffect(() => {
    if (!user || expandedTaskId) {
      return
    }

    const intervalMs = hasActiveTasks ? 5000 : 30000

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadTasks(false)
      }
    }, intervalMs)

    return () => window.clearInterval(interval)
  }, [user, hasActiveTasks, expandedTaskId, loadTasks])

  async function toggleTask(task: ActivityTask) {
    const nextExpanded = expandedTaskId === task.id ? null : task.id
    setExpandedTaskId(nextExpanded)

    if (nextExpanded !== task.id || taskDetails[task.id]) {
      return
    }

    try {
      setTaskDetailLoadingId(task.id)
      const res = await fetch(`/api/v1/tasks/${task.id}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      if (res.status === 401) {
        router.push('/dashboard/login')
        return
      }
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || (lang === 'zh' ? '加载任务详情失败' : 'Failed to load task details'))
      setTaskDetails((current) => ({ ...current, [task.id]: body.data }))
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'zh' ? '加载任务详情失败' : 'Failed to load task details'))
    } finally {
      setTaskDetailLoadingId((current) => (current === task.id ? null : current))
    }
  }

  const totalCharged = useMemo(
    () => usageRows.filter((row) => row.costStatus === 'CHARGED' && row.cost !== null).reduce((sum, row) => sum + (row.cost ?? 0), 0),
    [usageRows],
  )

  const totalRefunded = useMemo(
    () => usageRows.filter((row) => row.costStatus === 'REFUNDED' && row.cost !== null).reduce((sum, row) => sum + (row.cost ?? 0), 0),
    [usageRows],
  )

  const completedTasks = tasksData?.tasks.filter((task) => task.status === 'SUCCEEDED' || task.status === 'FAILED') ?? []
  const succeededTasks = tasksData?.tasks.filter((task) => task.status === 'SUCCEEDED') ?? []
  const successRate = completedTasks.length ? (succeededTasks.length / completedTasks.length) * 100 : 0

  if (!user) {
    return <div className="text-gray-500">{lang === 'zh' ? '正在加载活动...' : 'Loading activity...'}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('navActivity')}</h2>
        <p className="mt-1 text-sm text-gray-500">{lang === 'zh' ? '在一个页面里查看你的任务历史和计费用量。' : 'Review your task history and billing usage in one place.'}</p>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">{lang === 'zh' ? '总任务数' : 'Total Tasks'}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{tasksData?.total ?? 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">{t('successRate')}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{successRate.toFixed(1)}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">{lang === 'zh' ? '已扣费' : 'Charged'}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">¥{totalCharged.toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-gray-500">{lang === 'zh' ? '已退款' : 'Refunded'}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">¥{totalRefunded.toFixed(2)}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('tasks')}
          className={`rounded-md px-4 py-2 text-sm ${activeTab === 'tasks' ? 'bg-blue-600 text-white' : 'border border-gray-300 bg-white text-gray-700'}`}
        >
          {lang === 'zh' ? '任务' : 'Tasks'}
        </button>
        <button
          onClick={() => setActiveTab('usage')}
          className={`rounded-md px-4 py-2 text-sm ${activeTab === 'usage' ? 'bg-blue-600 text-white' : 'border border-gray-300 bg-white text-gray-700'}`}
        >
          {lang === 'zh' ? '用量' : 'Usage'}
        </button>
      </div>

      {activeTab === 'tasks' ? (
        <div className="space-y-4">
          <div className="flex gap-1">
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                onClick={() => {
                  setStatusFilter(tab.value)
                  setTasksPage(1)
                }}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${statusFilter === tab.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
            {tasksLoading ? <div className="p-4 text-gray-500">{lang === 'zh' ? '正在加载任务...' : 'Loading tasks...'}</div> : null}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-gray-500">
                    <th className="w-8 px-4 py-2.5 font-medium" />
                    <th className="px-4 py-2.5 font-medium">ID</th>
                    <th className="px-4 py-2.5 font-medium">{t('status')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('apiKey')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('duration')}</th>
                    <th className="px-4 py-2.5 font-medium">{t('created')}</th>
                  </tr>
                </thead>
                <tbody>
                  {!tasksData || tasksData.tasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400">{t('noTasksFound')}</td>
                    </tr>
                  ) : tasksData.tasks.map((task, i) => {
                    const detail = taskDetails[task.id] ?? task
                    const assets = detail.assets ?? []
                    const expanded = expandedTaskId === task.id
                    return (
                      <Fragment key={task.id}>
                        <tr className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} cursor-pointer hover:bg-gray-50`} onClick={() => toggleTask(task)}>
                          <td className="px-4 py-2.5">{expanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{task.id.slice(0, 8)}</td>
                          <td className="px-4 py-2.5"><StatusBadge status={task.status} lang={lang} /></td>
                          <td className="px-4 py-2.5 text-gray-600">{task.apiKey?.name ?? (task.apiKey?.keyPrefix ? `${task.apiKey.keyPrefix}...` : '-')}</td>
                          <td className="px-4 py-2.5 text-gray-600">{formatDuration(task.durationMs)}</td>
                          <td className="px-4 py-2.5 whitespace-nowrap text-xs text-gray-500">{formatDate(task.createdAt)}</td>
                        </tr>
                        {expanded ? (
                          <tr className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                            <td colSpan={6} className="bg-gray-50 px-4 py-4">
                              {taskDetailLoadingId === task.id && !taskDetails[task.id] ? (
                                <div className="rounded border border-gray-200 bg-white px-3 py-4 text-sm text-gray-500">{lang === 'zh' ? '正在加载任务详情...' : 'Loading task details...'}</div>
                              ) : (
                                <div className="space-y-4">
                                  <div className="rounded border border-gray-200 bg-white px-3 py-3 text-sm text-gray-600">
                                    {task.status === 'FAILED'
                                      ? (lang === 'zh' ? '此任务已失败。请从你的客户端重试，或在问题持续时联系支持。' : 'This task failed. Please retry from your client or contact support if the problem continues.')
                                      : task.status === 'PROCESSING'
                                        ? (lang === 'zh' ? '此任务仍在处理中。' : 'This task is still processing.')
                                        : task.status === 'QUEUED'
                                          ? (lang === 'zh' ? '此任务正在队列中等待。' : 'This task is waiting in the queue.')
                                          : lang === 'zh'
                                            ? `此任务已成功完成，共生成 ${assets.length} 张图片。`
                                            : `This task completed successfully with ${assets.length} generated image${assets.length === 1 ? '' : 's'}.`}
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {tasksData && tasksData.totalPages > 1 ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">{t('pageOfTotal', { page: tasksData.page, totalPages: tasksData.totalPages, total: tasksData.total })}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setTasksPage(Math.max(1, tasksPage - 1))}
                  disabled={tasksPage <= 1}
                  className="rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                >
                  {t('previous')}
                </button>
                <button
                  onClick={() => setTasksPage(Math.min(tasksData.totalPages, tasksPage + 1))}
                  disabled={tasksPage >= tasksData.totalPages}
                  className="rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-200 disabled:opacity-50"
                >
                  {t('next')}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="max-w-xs">
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('apiKey')}</label>
                <select
                  value={selectedApiKeyId}
                  onChange={(e) => setSelectedApiKeyId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                >
                  <option value="ALL">{lang === 'zh' ? '全部 API 密钥' : 'All API Keys'}</option>
                  {apiKeys.map((key) => (
                    <option key={key.id} value={key.id}>
                      {key.name} ({key.keyPrefix}...)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{lang === 'zh' ? '已扣费' : 'Charged'}</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">¥{totalCharged.toFixed(2)}</p>
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-gray-500">{lang === 'zh' ? '已退款' : 'Refunded'}</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">¥{totalRefunded.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            {usageLoading ? <div className="p-4 text-gray-500">{lang === 'zh' ? '正在加载用量...' : 'Loading usage...'}</div> : null}
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">{t('time')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('apiKey')}</th>
                  <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '尺寸' : 'Size'}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('cost')}</th>
                  <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '费用状态' : 'Cost Status'}</th>
                  <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '任务状态' : 'Task Status'}</th>
                </tr>
              </thead>
              <tbody>
                {usageRows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-700">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-900">{row.apiKeyName}</td>
                    <td className="px-4 py-3 text-gray-700">{row.size || '-'}</td>
                    <td className="px-4 py-3 text-gray-900">{row.cost !== null ? `¥${row.cost.toFixed(2)}` : '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{row.costStatus ? paymentStatusLabel(lang, row.costStatus) : '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{taskStatusLabel(lang, row.status as TaskStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
