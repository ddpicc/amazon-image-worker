'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'
import { ChevronDown, ChevronRight, RotateCcw } from 'lucide-react'
import { taskStatusLabel, useDashboardI18n, type DashboardLanguage } from '@/lib/dashboard/i18n'

type TaskStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

interface Task {
  id: string
  prompt?: string
  status: TaskStatus
  operation?: {
    entryPoint?: string | null
  } | null
  selectedProviderName?: string | null
  durationMs: number | null
  createdAt: string
  errorMessage: string | null
  responseSnapshotJson?: ResponseSnapshot | null
  requestSnapshotJson?: unknown
  requestPayloadJson?: unknown
  cost?: number | null
  costStatus?: string | null
  pricingSku?: string | null
  unitPrice?: number | null
  priceVersion?: number | null
  callbackUrl?: string | null
  workerJobId?: string | null
  capacityRequeueCount?: number
  apiKey?: { id: string; name: string; keyPrefix: string } | null
  attempts?: TaskAttempt[]
  assets?: TaskAsset[]
  webhookDeliveries?: WebhookDelivery[]
  _count?: {
    attempts: number
    assets: number
    webhookDeliveries?: number
  }
}

interface TaskAttempt {
  id: string
  providerId: string | null
  provider?: {
    id: string
    name: string
  } | null
  baseUrl: string
  model: string
  attemptIndex: number
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED'
  durationMs: number | null
  errorMessage: string | null
  errorType: string | null
  startedAt: string
  completedAt: string | null
  responseSnapshotJson?: ResponseSnapshot | null
}

interface TaskAsset {
  id: string
  cosUrl: string
  mimeType: string
  bytes: number
  createdAt: string
}

interface WebhookDelivery {
  id: string
  callbackUrl: string
  attemptIndex: number
  status: 'STARTED' | 'SUCCEEDED' | 'FAILED'
  httpStatus: number | null
  durationMs: number | null
  errorMessage: string | null
  responseBodySample: string | null
  createdAt: string
  completedAt: string | null
}

interface TasksResponse {
  tasks: Task[]
  total: number
  page: number
  limit: number
  totalPages: number
}

interface TimingSnapshot {
  decryptMs?: number
  upstreamMs?: number
  cosUploadMs?: number
  assetPersistMs?: number
  totalInnerMs?: number
  attemptTotalMs?: number
  requestTotalMs?: number
}

interface ResponseSnapshot {
  timing?: TimingSnapshot | null
  returnedImageUrlKind?: string | null
  uploadedBytes?: number | null
  uploadedUrl?: string | null
}

function StatusBadge({ status, lang }: { status: TaskStatus; lang: DashboardLanguage }) {
  const styles: Record<TaskStatus, string> = {
    QUEUED: 'bg-gray-100 text-gray-800',
    PROCESSING: 'bg-yellow-100 text-yellow-800',
    SUCCEEDED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
  }
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status]}`}>{taskStatusLabel(lang, status)}</span>
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString()
}

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

function classifyEntryPoint(entryPoint: string | null | undefined, lang: DashboardLanguage): string {
  if (!entryPoint) return '-'
  if (entryPoint.includes('-sync')) {
    return lang === 'zh' ? '同步' : 'Sync'
  }
  if (entryPoint.startsWith('openai-images-')) {
    return lang === 'zh' ? '异步' : 'Async'
  }
  if (entryPoint === 'direct') {
    return lang === 'zh' ? '直连' : 'Direct'
  }
  return entryPoint
}

function TimingGrid({ timing, lang }: { timing?: TimingSnapshot | null; lang: DashboardLanguage }) {
  const { t } = useDashboardI18n()
  if (!timing) {
    return <p className="text-xs text-gray-400">{t('noTimingData')}</p>
  }

  const items: Array<{ label: string; value: number | undefined }> = [
    { label: t('decrypt'), value: timing.decryptMs },
    { label: t('upstream'), value: timing.upstreamMs },
    { label: t('cosUpload'), value: timing.cosUploadMs },
    { label: t('assetPersist'), value: timing.assetPersistMs },
    { label: t('innerTotal'), value: timing.totalInnerMs },
    { label: t('attemptTotal'), value: timing.attemptTotalMs },
    { label: t('requestTotal'), value: timing.requestTotalMs },
  ].filter((item) => item.value != null)

  if (items.length === 0) {
    return <p className="text-xs text-gray-400">{t('noTimingData')}</p>
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded border border-gray-200 bg-white px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">{item.label}</p>
          <p className="mt-1 text-sm font-medium text-gray-900">{formatDuration(item.value ?? null)}</p>
        </div>
      ))}
    </div>
  )
}

export default function TasksPage() {
  const router = useRouter()
  const { lang, t } = useDashboardI18n()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [data, setData] = useState<TasksResponse | null>(null)
  const [details, setDetails] = useState<Record<string, Task>>({})
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'ALL'>('ALL')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const limit = 20
  const hasActiveTasks = data?.tasks.some((task) => task.status === 'QUEUED' || task.status === 'PROCESSING') ?? false
  const statusTabs: { label: string; value: TaskStatus | 'ALL' }[] = [
    { label: t('taskTabAll'), value: 'ALL' },
    { label: t('taskTabQueued'), value: 'QUEUED' },
    { label: t('taskTabProcessing'), value: 'PROCESSING' },
    { label: t('taskTabSucceeded'), value: 'SUCCEEDED' },
    { label: t('taskTabFailed'), value: 'FAILED' },
  ]

  const fetchTasks = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) })
      if (statusFilter !== 'ALL') params.set('status', statusFilter)
      const res = await fetch(`/api/v1/tasks?${params}`, {
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
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setData(json)
      setDetails({})
      setError('')
    } catch {
      setError(t('failedToLoadTasks'))
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, router])

  useEffect(() => {
    let mounted = true
    fetchCurrentUser().then((u) => {
      if (!mounted) return
      if (!u) {
        router.push('/dashboard/login')
        return
      }
      if (u.role !== 'ADMIN') {
        router.push('/dashboard/activity')
        return
      }
      setUser(u)
    })
    return () => {
      mounted = false
    }
  }, [router])

  useEffect(() => {
    if (!user) {
      return
    }
    fetchTasks()
  }, [user, fetchTasks])

  useEffect(() => {
    if (!user || expandedId) {
      return
    }

    const intervalMs = hasActiveTasks ? 5000 : 30000

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchTasks()
      }
    }, intervalMs)

    return () => window.clearInterval(interval)
  }, [user, hasActiveTasks, expandedId, fetchTasks])

  function handleTabChange(value: TaskStatus | 'ALL') {
    setStatusFilter(value)
    setPage(1)
    setExpandedId(null)
  }

  async function handleToggle(task: Task) {
    const nextExpanded = expandedId === task.id ? null : task.id
    setExpandedId(nextExpanded)

    if (nextExpanded !== task.id || details[task.id]) {
      return
    }

    try {
      setDetailLoadingId(task.id)
      const res = await fetch(`/api/v1/tasks/${task.id}`, {
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
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }
      const json = await res.json()
      setDetails((current) => ({ ...current, [task.id]: json.data }))
    } catch {
      setError(t('failedToLoadTaskDetails'))
    } finally {
      setDetailLoadingId((current) => (current === task.id ? null : current))
    }
  }

  async function handleRetry(_task: Task) {
    alert(t('retryNotReady'))
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="text-gray-500">{t('loadingTasks')}</div></div>
  if (error && !data) return <div className="flex items-center justify-center h-64"><div className="text-red-600">{error}</div></div>

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{user?.role === 'ADMIN' ? t('tasksTitleAdmin') : t('tasksTitleUser')}</h2>
          <p className="text-sm text-gray-500 mt-1">{user?.role === 'ADMIN' ? t('tasksSubtitleAdmin') : t('tasksSubtitleUser')}</p>
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        {statusTabs.map((tab) => (
          <button key={tab.value} onClick={() => handleTabChange(tab.value)} className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${statusFilter === tab.value ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="rounded-lg shadow-sm border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2.5 font-medium w-8"></th>
                <th className="px-4 py-2.5 font-medium">ID</th>
                {user?.role === 'ADMIN' ? <th className="px-4 py-2.5 font-medium">{t('prompt')}</th> : null}
                <th className="px-4 py-2.5 font-medium">{t('status')}</th>
                {user?.role === 'ADMIN' ? <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '端点' : 'Endpoint'}</th> : null}
                {user?.role === 'ADMIN' ? <th className="px-4 py-2.5 font-medium">{t('provider')}</th> : null}
                <th className="px-4 py-2.5 font-medium">{t('apiKey')}</th>
                {user?.role === 'ADMIN' ? <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '费用' : 'Cost'}</th> : null}
                <th className="px-4 py-2.5 font-medium">{t('duration')}</th>
                <th className="px-4 py-2.5 font-medium">{t('created')}</th>
              </tr>
            </thead>
            <tbody>
              {!data || data.tasks.length === 0 ? (
                <tr><td colSpan={user?.role === 'ADMIN' ? 10 : 6} className="px-4 py-8 text-center text-gray-400">{t('noTasksFound')}</td></tr>
              ) : data.tasks.map((task, i) => (
                <TaskRow
                  key={task.id}
                  task={details[task.id] ?? task}
                  summaryTask={task}
                  i={i}
                  expanded={expandedId === task.id}
                  detailsLoaded={!!details[task.id]}
                  detailLoading={detailLoadingId === task.id}
                  showAdminDebug={user?.role === 'ADMIN'}
                  isAdmin={user?.role === 'ADMIN'}
                  lang={lang}
                  onToggle={() => handleToggle(task)}
                  onRetry={handleRetry}
                  retrying={false}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500">{t('pageOfTotal', { page: data.page, totalPages: data.totalPages, total: data.total })}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors">{t('previous')}</button>
            <button onClick={() => setPage(Math.min(data.totalPages, page + 1))} disabled={page >= data.totalPages} className="px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded hover:bg-gray-200 disabled:opacity-50 transition-colors">{t('next')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({
  task,
  summaryTask,
  i,
  expanded,
  detailsLoaded,
  detailLoading,
  onToggle,
  onRetry,
  retrying,
  showAdminDebug,
  isAdmin,
  lang,
}: {
  task: Task
  summaryTask: Task
  i: number
  expanded: boolean
  detailsLoaded: boolean
  detailLoading: boolean
  onToggle: () => void
  onRetry: (t: Task) => void
  retrying: boolean
  showAdminDebug: boolean
  isAdmin: boolean
  lang: DashboardLanguage
}) {
  const { t } = useDashboardI18n()
  const attempts = task.attempts ?? []
  const assets = task.assets ?? []
  const webhookDeliveries = task.webhookDeliveries ?? []

  return (
    <>
      <tr className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50 cursor-pointer`} onClick={onToggle}>
        <td className="px-4 py-2.5">{expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}</td>
        <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{task.id.slice(0, 8)}</td>
        {isAdmin ? <td className="px-4 py-2.5 text-gray-700 max-w-[200px] truncate">{task.prompt || '-'}</td> : null}
        <td className="px-4 py-2.5"><StatusBadge status={task.status} lang={lang} /></td>
        {isAdmin ? <td className="px-4 py-2.5 text-gray-600">{classifyEntryPoint(task.operation?.entryPoint, lang)}</td> : null}
        {isAdmin ? <td className="px-4 py-2.5 text-gray-600">{task.selectedProviderName || '-'}</td> : null}
        <td className="px-4 py-2.5 text-gray-600">
          {task.apiKey?.name ?? (task.apiKey?.keyPrefix ? `${task.apiKey.keyPrefix}...` : '-')}
        </td>
        {isAdmin ? <td className="px-4 py-2.5 text-gray-600">{task.cost != null ? `¥${Number(task.cost).toFixed(2)}` : '-'}</td> : null}
        <td className="px-4 py-2.5 text-gray-600">{formatDuration(task.durationMs)}</td>
        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap text-xs">{formatDate(task.createdAt)}</td>
      </tr>
      {expanded && (
        <tr className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
          <td colSpan={isAdmin ? 10 : 6} className="px-4 py-4 bg-gray-50">
            <div className="space-y-4 ml-4">
              {isAdmin ? (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">{t('prompt')}</h4>
                  <p className="text-sm text-gray-800 bg-white rounded border border-gray-200 p-3 whitespace-pre-wrap">{task.prompt}</p>
                </div>
              ) : null}

              {!detailsLoaded && detailLoading && (
                <div className="rounded border border-gray-200 bg-white px-3 py-4 text-sm text-gray-500">
                  {t('detailsLoading')}
                </div>
              )}

              {!detailsLoaded && !detailLoading && (
                <div className="rounded border border-gray-200 bg-white px-3 py-3 text-sm text-gray-500">
                  {t('detailsOnDemand', { attempts: summaryTask._count?.attempts ?? 0, images: summaryTask._count?.assets ?? 0 })}
                </div>
              )}

              {attempts.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">{t('taskAttempts', { count: attempts.length })}</h4>
                  <div className="space-y-2">
                    {attempts.map((attempt) => (
                      <div key={attempt.id} className="bg-white rounded border border-gray-200 p-3 text-sm">
                        <div className="flex items-center gap-3 text-gray-600">
                          <span className="font-medium">#{attempt.attemptIndex}</span>
                          <span>{attempt.provider?.name || attempt.providerId || attempt.baseUrl || '-'}</span>
                          <span className="text-gray-400">·</span>
                          <span>{attempt.model}</span>
                          <StatusBadge status={attempt.status === 'STARTED' ? 'PROCESSING' : attempt.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED'} lang={lang} />
                          <span className="text-xs text-gray-400">{formatDuration(attempt.durationMs)}</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500 space-y-0.5">
                          <div>Provider: {attempt.provider?.name || '-'}</div>
                          <div>Provider ID: {attempt.providerId || '-'}</div>
                          <div className="break-all">Base URL: {attempt.baseUrl || '-'}</div>
                        </div>
                        <div className="mt-2 space-y-2">
                          <TimingGrid timing={attempt.responseSnapshotJson?.timing} lang={lang} />
                          {(attempt.responseSnapshotJson?.returnedImageUrlKind || attempt.responseSnapshotJson?.uploadedBytes != null) && (
                            <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                <span>{t('resultKind')}: {attempt.responseSnapshotJson?.returnedImageUrlKind || '-'}</span>
                                <span>{t('uploadedSize')}: {formatBytes(attempt.responseSnapshotJson?.uploadedBytes)}</span>
                              </div>
                            </div>
                          )}
                        </div>
                        {attempt.errorMessage && <p className="mt-1 text-xs text-red-600">{attempt.errorMessage}</p>}
                        {attempt.errorType && <p className="mt-0.5 text-xs text-orange-600">{t('errorType')}: {attempt.errorType}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {showAdminDebug && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">{t('adminDebug')}</h4>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded border border-gray-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">{t('cost')}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">{task.cost != null ? `¥${Number(task.cost).toFixed(2)}` : '-'} {task.costStatus ? `(${task.costStatus})` : ''}</p>
                    </div>
                    <div className="rounded border border-gray-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">{t('pricing')}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">
                        {task.pricingSku || '-'} {task.unitPrice != null ? `¥${Number(task.unitPrice).toFixed(2)}` : ''} {task.priceVersion ? `v${task.priceVersion}` : ''}
                      </p>
                    </div>
                    <div className="rounded border border-gray-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">{t('workerJob')}</p>
                      <p className="mt-1 text-sm font-mono text-gray-900 break-all">{task.workerJobId || '-'}</p>
                    </div>
                    <div className="rounded border border-gray-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">{t('requeues')}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">{task.capacityRequeueCount ?? 0}</p>
                    </div>
                    <div className="rounded border border-gray-200 bg-white px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">{t('webhooks')}</p>
                      <p className="mt-1 text-sm font-medium text-gray-900">{task._count?.webhookDeliveries ?? webhookDeliveries.length}</p>
                    </div>
                  </div>
                  {task.callbackUrl && (
                    <p className="mt-2 rounded border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 break-all">{t('callback')}: {task.callbackUrl}</p>
                  )}
                </div>
              )}

              {showAdminDebug && webhookDeliveries.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">{t('webhookDeliveries', { count: webhookDeliveries.length })}</h4>
                  <div className="space-y-2">
                    {webhookDeliveries.map((delivery) => (
                      <div key={delivery.id} className="bg-white rounded border border-gray-200 p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-3 text-gray-600">
                          <span className="font-medium">#{delivery.attemptIndex}</span>
                          <StatusBadge status={delivery.status === 'STARTED' ? 'PROCESSING' : delivery.status === 'SUCCEEDED' ? 'SUCCEEDED' : 'FAILED'} lang={lang} />
                          <span>HTTP {delivery.httpStatus ?? '-'}</span>
                          <span className="text-xs text-gray-400">{formatDuration(delivery.durationMs)}</span>
                          <span className="text-xs text-gray-400">{formatDate(delivery.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500 break-all">{delivery.callbackUrl}</p>
                        {delivery.errorMessage && <p className="mt-1 text-xs text-red-600">{delivery.errorMessage}</p>}
                        {delivery.responseBodySample && <pre className="mt-2 max-h-24 overflow-auto rounded bg-gray-50 p-2 text-xs text-gray-600 whitespace-pre-wrap">{delivery.responseBodySample}</pre>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {assets.length > 0 && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 uppercase mb-1">{t('generatedImages')}</h4>
                  <div className="flex flex-wrap gap-3">
                    {assets.map((asset) => (
                      <a key={asset.id} href={asset.cosUrl} target="_blank" rel="noopener noreferrer">
                        <img src={asset.cosUrl} alt={`Generated image ${asset.id.slice(0, 8)}`} className="w-32 h-32 object-cover rounded border border-gray-200 hover:opacity-80 transition-opacity" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {task.status === 'FAILED' && (
                <button onClick={(e) => { e.stopPropagation(); onRetry(task) }} disabled={retrying} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  <RotateCcw className="w-3.5 h-3.5" />{retrying ? t('retrying') : t('retry')}
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
