'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { fetchCurrentUser } from '@/lib/dashboard/auth'
import { taskStatusLabel, useDashboardI18n } from '@/lib/dashboard/i18n'

interface DebugTask {
  id: string
  prompt: string
  status: string
  selectedProviderName: string | null
  selectedProviderBaseUrl?: string | null
  selectedProviderModel?: string | null
  attemptCount?: number
  durationMs: number | null
  errorMessage: string | null
  statusMessage?: string | null
  createdAt: string
  cost: number | null
  costStatus: string | null
  pricingSku?: string | null
  unitPrice?: number | null
  priceVersion?: number | null
  callbackUrl?: string | null
  workerJobId?: string | null
  capacityRequeueCount?: number | null
  requestSnapshotJson?: unknown
  responseSnapshotJson?: ResponseSnapshot | null
  finalPrompt?: string | null
  attempts?: TaskAttempt[]
  webhookDeliveries?: WebhookDelivery[]
  assets?: TaskAsset[]
  _count?: {
    attempts: number
    assets: number
    webhookDeliveries?: number
  }
}


interface AuditLog {
  id: string
  createdAt: string
  action: string
  resourceType: string
  resourceId: string | null
  requestId: string | null
  actorUser?: { email: string } | null
  targetUser?: { email: string } | null
}

interface CircuitBreakerEvent {
  id: string
  trippedAt: string
  tripReason: string
  attemptId: string | null
  requestId: string | null
  attemptIndex: number | null
  baseUrl: string | null
  model: string | null
  errorType: string | null
  errorMessage: string | null
  durationMs: number | null
  prompt: string | null
  provider: { id: string; name: string; vendor: string }
}

interface DebugResponse {
  tasks: DebugTask[]
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
  responseSnapshotJson?: ResponseSnapshot | null
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

interface TaskAsset {
  id: string
  cosUrl: string
  mimeType: string
  bytes: number
  createdAt: string
}

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return '-'
  return `¥${value.toFixed(2)}`
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}

function formatDuration(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatBytes(bytes: number | null | undefined) {
  if (bytes === null || bytes === undefined) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function prettyJson(value: unknown) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function StatusPill({ label, tone }: { label: string; tone: 'gray' | 'green' | 'red' | 'yellow' | 'blue' | 'orange' }) {
  const tones: Record<typeof tone, string> = {
    gray: 'bg-gray-100 text-gray-800',
    green: 'bg-green-100 text-green-800',
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    blue: 'bg-blue-100 text-blue-800',
    orange: 'bg-orange-100 text-orange-800',
  }

  return <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{label}</span>
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  const text = prettyJson(value)

  return (
    <div>
      <h4 className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">{title}</h4>
      <div className="rounded border border-gray-200 bg-white">
        {text ? (
          <pre className="max-h-72 overflow-auto p-3 text-xs leading-relaxed text-gray-700 whitespace-pre-wrap break-all">{text}</pre>
        ) : (
          <div className="px-3 py-4 text-sm text-gray-400">No data</div>
        )}
      </div>
    </div>
  )
}

export default function DebugPage() {
  const router = useRouter()
  const { lang } = useDashboardI18n()
  const [query, setQuery] = useState('')
  const [tasks, setTasks] = useState<DebugTask[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [circuitBreakerEvents, setCircuitBreakerEvents] = useState<CircuitBreakerEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [pageInfo, setPageInfo] = useState({ total: 0, totalPages: 1 })
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null)
  const [detailLoadingId, setDetailLoadingId] = useState<string | null>(null)
  const [taskDetails, setTaskDetails] = useState<Record<string, DebugTask>>({})
  const [detailErrors, setDetailErrors] = useState<Record<string, string>>({})

  const load = useCallback(async (opts?: { q?: string; page?: number }) => {
    const nextQuery = opts?.q ?? query
    const nextPage = opts?.page ?? page

    setLoading(true)
    try {
      const queryParams = nextQuery ? `?q=${encodeURIComponent(nextQuery)}` : ''
      const [failedTasksRes, auditLogsRes, breakerEventsRes] = await Promise.all([
        fetch(`/api/v1/tasks?status=FAILED&page=${nextPage}&limit=20`, { credentials: 'include', cache: 'no-store' }),
        fetch(`/api/v1/admin/audit-logs${queryParams}`, { credentials: 'include', cache: 'no-store' }),
        fetch('/api/v1/admin/provider-circuit-breaker-events', { credentials: 'include', cache: 'no-store' }),
      ])

      if ([failedTasksRes, auditLogsRes, breakerEventsRes].some((res) => res.status === 401)) {
        router.push('/dashboard/login')
        return
      }
      if ([failedTasksRes, auditLogsRes, breakerEventsRes].some((res) => res.status === 403)) {
        router.push('/dashboard')
        return
      }

      const failedTasksBody = await failedTasksRes.json().catch(() => ({}))
      const auditLogsBody = await auditLogsRes.json().catch(() => ({}))
      const breakerEventsBody = await breakerEventsRes.json().catch(() => ({}))
      if (!failedTasksRes.ok) throw new Error(failedTasksBody.error || (lang === 'zh' ? '加载失败任务失败' : 'Failed to load failed tasks'))
      if (!auditLogsRes.ok) throw new Error(auditLogsBody.error || (lang === 'zh' ? '加载审计日志失败' : 'Failed to load audit logs'))

      const failedTasksData = failedTasksBody as DebugResponse
      setTasks(failedTasksData.tasks || [])
      setPageInfo({
        total: failedTasksData.total || 0,
        totalPages: failedTasksData.totalPages || 1,
      })
      setAuditLogs(auditLogsBody.logs || [])
      setCircuitBreakerEvents(breakerEventsRes.ok ? breakerEventsBody.data || [] : [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'zh' ? '加载调试数据失败' : 'Failed to load debug data'))
    } finally {
      setLoading(false)
    }
  }, [page, query, router])

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
      load({ page })
    })

    return () => {
      mounted = false
    }
  }, [load, page, router])

  async function loadTaskDetail(taskId: string) {
    try {
      setDetailLoadingId(taskId)
      setDetailErrors((current) => {
        const next = { ...current }
        delete next[taskId]
        return next
      })

      const res = await fetch(`/api/v1/tasks/${taskId}`, {
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
      setTaskDetails((current) => ({ ...current, [taskId]: json.data }))
    } catch (err) {
      setDetailErrors((current) => ({
        ...current,
        [taskId]: err instanceof Error ? err.message : (lang === 'zh' ? '加载任务详情失败' : 'Failed to load task details'),
      }))
    } finally {
      setDetailLoadingId((current) => (current === taskId ? null : current))
    }
  }

  async function toggleTask(task: DebugTask) {
    const nextExpanded = expandedTaskId === task.id ? null : task.id
    setExpandedTaskId(nextExpanded)

    if (nextExpanded !== task.id || taskDetails[task.id] || detailLoadingId === task.id) {
      return
    }

    await loadTaskDetail(task.id)
  }

  function changePage(nextPage: number) {
    setExpandedTaskId(null)
    setDetailLoadingId(null)
    setPage(nextPage)
  }

  const ui = {
    time: lang === 'zh' ? '时间' : 'Time',
    task: lang === 'zh' ? '任务' : 'Task',
    provider: lang === 'zh' ? '供应商' : 'Provider',
    cost: lang === 'zh' ? '费用' : 'Cost',
    error: lang === 'zh' ? '错误' : 'Error',
    noFailedTasks: lang === 'zh' ? '没有找到失败任务' : 'No failed tasks found',
    collapse: lang === 'zh' ? '收起失败任务详情' : 'Collapse failed task details',
    expand: lang === 'zh' ? '展开失败任务详情' : 'Expand failed task details',
    loadingDetail: lang === 'zh' ? '正在加载任务详情...' : 'Loading task details...',
    duration: lang === 'zh' ? '耗时' : 'Duration',
    attempts: lang === 'zh' ? '尝试次数' : 'Attempts',
    unit: lang === 'zh' ? '单价' : 'Unit',
    worker: 'Worker',
    requeues: lang === 'zh' ? '重入队次数' : 'Requeues',
    prompt: lang === 'zh' ? '提示词' : 'Prompt',
    webhooks: lang === 'zh' ? 'Webhook 次数' : 'Webhooks',
    requestSnapshot: lang === 'zh' ? '请求快照' : 'Request Snapshot',
    responseSnapshot: lang === 'zh' ? '响应快照' : 'Response Snapshot',
    generatedImages: lang === 'zh' ? '生成图片' : 'Generated Images',
    circuitBreakerEvents: lang === 'zh' ? '熔断记录' : 'Circuit Breaker Events',
    noCircuitBreakerEvents: lang === 'zh' ? '暂无熔断记录。后续每一次熔断都会保留导致熔断的最后一次调用。' : 'No circuit breaker events yet. Future events will retain the final triggering call.',
    auditLogs: lang === 'zh' ? '审计日志' : 'Audit Logs',
    action: lang === 'zh' ? '操作' : 'Action',
    actor: lang === 'zh' ? '操作者' : 'Actor',
    target: lang === 'zh' ? '目标用户' : 'Target',
    resource: lang === 'zh' ? '资源' : 'Resource',
    requestId: lang === 'zh' ? '请求 ID' : 'Request ID',
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{lang === 'zh' ? '调试' : 'Debug'}</h2>
          <p className="mt-1 text-sm text-gray-500">{lang === 'zh' ? '搜索最近失败任务和审计日志。' : 'Search recent failures and audit logs.'}</p>
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={lang === 'zh' ? '任务 id / outTradeNo / 邮箱 / requestId' : 'task id / outTradeNo / email / requestId'}
            className="w-80 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button onClick={() => load({ q: query, page })} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">
            {lang === 'zh' ? '搜索' : 'Search'}
          </button>
        </div>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="text-gray-500">{lang === 'zh' ? '正在加载调试数据...' : 'Loading debug data...'}</div> : null}

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">{lang === 'zh' ? '最近失败任务' : 'Recent Failed Tasks'}</div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="w-10 px-4 py-3 text-left font-medium" />
              <th className="px-4 py-3 text-left font-medium">{ui.time}</th>
              <th className="px-4 py-3 text-left font-medium">{ui.task}</th>
              <th className="px-4 py-3 text-left font-medium">{ui.provider}</th>
              <th className="px-4 py-3 text-left font-medium">{ui.cost}</th>
              <th className="px-4 py-3 text-left font-medium">{ui.error}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  {ui.noFailedTasks}
                </td>
              </tr>
            ) : (
              tasks.map((task, i) => {
                const detail = taskDetails[task.id]
                const detailSource = detail || task
                const attempts = detailSource.attempts ?? []
                const webhookDeliveries = detailSource.webhookDeliveries ?? []
                const assets = detailSource.assets ?? []
                const detailError = detailErrors[task.id]
                const isExpanded = expandedTaskId === task.id

                return (
                  <Fragment key={task.id}>
                    <tr className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleTask(task)}
                          className="text-gray-400 hover:text-gray-600"
                          aria-label={isExpanded ? ui.collapse : ui.expand}
                        >
                          {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{formatDate(task.createdAt)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-900">{task.id}</td>
                      <td className="px-4 py-3 text-gray-700">{task.selectedProviderName || '-'}</td>
                      <td className="px-4 py-3 text-gray-900">
                        {money(task.cost)} {task.costStatus ? `(${task.costStatus})` : ''}
                      </td>
                      <td className="px-4 py-3 text-red-700">{task.errorMessage || '-'}</td>
                    </tr>
                    {isExpanded && (
                      <tr className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td colSpan={6} className="bg-gray-50 px-4 py-4">
                          <div className="space-y-4">
                            {!detail && detailLoadingId === task.id ? (
                              <div className="rounded border border-gray-200 bg-white px-3 py-4 text-sm text-gray-500">
                                {ui.loadingDetail}
                              </div>
                            ) : null}

                            {detailError ? (
                              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                                {detailError}
                              </div>
                            ) : null}

                            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded border border-gray-200 bg-white px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-gray-500">{ui.provider}</p>
                                <p className="mt-1 text-sm font-medium text-gray-900">{detailSource.selectedProviderName || '-'}</p>
                                <p className="mt-0.5 text-xs text-gray-500 break-all">{detailSource.selectedProviderBaseUrl || '-'}</p>
                                <p className="mt-0.5 text-xs text-gray-500">{detailSource.selectedProviderModel || '-'}</p>
                              </div>
                              <div className="rounded border border-gray-200 bg-white px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-gray-500">{ui.task}</p>
                                <p className="mt-1 text-sm font-medium text-gray-900">{taskStatusLabel(lang, (detailSource.status || task.status) as 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED')}</p>
                                <p className="mt-0.5 text-xs text-gray-500">{ui.duration}: {formatDuration(detailSource.durationMs ?? task.durationMs)}</p>
                                <p className="mt-0.5 text-xs text-gray-500">{ui.attempts}: {detailSource.attemptCount ?? attempts.length ?? 0}</p>
                              </div>
                              <div className="rounded border border-gray-200 bg-white px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-gray-500">{ui.error}</p>
                                <p className="mt-1 text-sm font-medium text-gray-900">{detailSource.errorMessage || task.errorMessage || '-'}</p>
                                {detailSource.statusMessage ? <p className="mt-0.5 text-xs text-gray-500 break-all">{detailSource.statusMessage}</p> : null}
                              </div>
                              <div className="rounded border border-gray-200 bg-white px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-gray-500">{ui.cost}</p>
                                <p className="mt-1 text-sm font-medium text-gray-900">{money(detailSource.cost ?? task.cost)} {detailSource.costStatus ? `(${detailSource.costStatus})` : task.costStatus ? `(${task.costStatus})` : ''}</p>
                                <p className="mt-0.5 text-xs text-gray-500">{detailSource.pricingSku || '-'}</p>
                                <p className="mt-0.5 text-xs text-gray-500">{ui.unit}: {money(detailSource.unitPrice)}</p>
                              </div>
                              <div className="rounded border border-gray-200 bg-white px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-gray-500">{ui.worker}</p>
                                <p className="mt-1 text-sm font-mono text-gray-900 break-all">{detailSource.workerJobId || '-'}</p>
                              </div>
                              <div className="rounded border border-gray-200 bg-white px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-gray-500">{ui.requeues}</p>
                                <p className="mt-1 text-sm font-medium text-gray-900">{detailSource.capacityRequeueCount ?? 0}</p>
                              </div>
                              <div className="rounded border border-gray-200 bg-white px-3 py-2 md:col-span-2 xl:col-span-2">
                                <p className="text-[11px] uppercase tracking-wide text-gray-500">{ui.prompt}</p>
                                <p className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-sm text-gray-800">{detailSource.finalPrompt || detailSource.prompt}</p>
                              </div>
                              <div className="rounded border border-gray-200 bg-white px-3 py-2">
                                <p className="text-[11px] uppercase tracking-wide text-gray-500">{ui.webhooks}</p>
                                <p className="mt-1 text-sm font-medium text-gray-900">{detailSource._count?.webhookDeliveries ?? webhookDeliveries.length ?? 0}</p>
                              </div>
                            </div>

                            <JsonBlock title={ui.requestSnapshot} value={detailSource.requestSnapshotJson} />
                            <JsonBlock title={ui.responseSnapshot} value={detailSource.responseSnapshotJson} />

                            {attempts.length > 0 ? (
                              <div>
                                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{ui.attempts} ({attempts.length})</h4>
                                <div className="space-y-2">
                                  {attempts.map((attempt) => (
                                    <div key={attempt.id} className="rounded border border-gray-200 bg-white p-3 text-sm">
                                      <div className="flex flex-wrap items-center gap-3 text-gray-600">
                                        <span className="font-medium">#{attempt.attemptIndex}</span>
                                        <span>{attempt.model}</span>
                                        <StatusPill
                                          label={taskStatusLabel(lang, attempt.status === 'STARTED' ? 'PROCESSING' : attempt.status)}
                                          tone={attempt.status === 'SUCCEEDED' ? 'green' : attempt.status === 'FAILED' ? 'red' : 'gray'}
                                        />
                                        <span className="text-xs text-gray-400">{formatDuration(attempt.durationMs)}</span>
                                      </div>
                                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                                        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            <span>{ui.provider}: {attempt.providerId || '-'}</span>
                                            <span>Base URL: {attempt.baseUrl || '-'}</span>
                                          </div>
                                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                            <span>{lang === 'zh' ? '开始时间' : 'Started'}: {formatDate(attempt.startedAt)}</span>
                                            <span>{lang === 'zh' ? '完成时间' : 'Completed'}: {attempt.completedAt ? formatDate(attempt.completedAt) : '-'}</span>
                                          </div>
                                        </div>
                                        <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                                            <span>{lang === 'zh' ? '返回类型' : 'Result Kind'}: {attempt.responseSnapshotJson?.returnedImageUrlKind || '-'}</span>
                                            <span>{lang === 'zh' ? '上传大小' : 'Uploaded Size'}: {formatBytes(attempt.responseSnapshotJson?.uploadedBytes)}</span>
                                          </div>
                                        </div>
                                      </div>
                                      {attempt.errorMessage ? <p className="mt-2 text-xs text-red-600">{attempt.errorMessage}</p> : null}
                                      {attempt.errorType ? <p className="mt-0.5 text-xs text-orange-600">{lang === 'zh' ? '类型' : 'Type'}: {attempt.errorType}</p> : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {webhookDeliveries.length > 0 ? (
                              <div>
                                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{lang === 'zh' ? 'Webhook 投递' : 'Webhook Deliveries'} ({webhookDeliveries.length})</h4>
                                <div className="space-y-2">
                                  {webhookDeliveries.map((delivery) => (
                                    <div key={delivery.id} className="rounded border border-gray-200 bg-white p-3 text-sm">
                                      <div className="flex flex-wrap items-center gap-3 text-gray-600">
                                        <span className="font-medium">#{delivery.attemptIndex}</span>
                                        <StatusPill
                                          label={taskStatusLabel(lang, delivery.status === 'STARTED' ? 'PROCESSING' : delivery.status)}
                                          tone={delivery.status === 'SUCCEEDED' ? 'green' : delivery.status === 'FAILED' ? 'red' : 'gray'}
                                        />
                                        <span>HTTP {delivery.httpStatus ?? '-'}</span>
                                        <span className="text-xs text-gray-400">{formatDuration(delivery.durationMs)}</span>
                                        <span className="text-xs text-gray-400">{formatDate(delivery.createdAt)}</span>
                                      </div>
                                      <p className="mt-1 break-all text-xs text-gray-500">{delivery.callbackUrl}</p>
                                      {delivery.errorMessage ? <p className="mt-1 text-xs text-red-600">{delivery.errorMessage}</p> : null}
                                      {delivery.responseBodySample ? (
                                        <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-600">{delivery.responseBodySample}</pre>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}

                            {assets.length > 0 ? (
                              <div>
                                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{ui.generatedImages} ({assets.length})</h4>
                                <div className="flex flex-wrap gap-3">
                                  {assets.map((asset) => (
                                    <a key={asset.id} href={asset.cosUrl} target="_blank" rel="noreferrer" className="block">
                                      <img
                                        src={asset.cosUrl}
                                        alt={`Generated image ${asset.id.slice(0, 8)}`}
                                        className="h-32 w-32 rounded border border-gray-200 object-cover transition-opacity hover:opacity-80"
                                      />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })
            )}
          </tbody>
        </table>
      </section>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-900">{ui.circuitBreakerEvents}</h3>
          <p className="mt-1 text-xs text-gray-500">{lang === 'zh' ? '保留触发熔断的最后一次失败调用，恢复服务后仍可查看。' : 'The last failed call that triggered each breaker is retained after service recovery.'}</p>
        </div>
        {circuitBreakerEvents.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-400">{ui.noCircuitBreakerEvents}</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {circuitBreakerEvents.map((event) => (
              <article key={event.id} className="p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium text-gray-900">{event.provider.name}</span>
                  <StatusPill label={lang === 'zh' ? '已熔断' : 'Tripped'} tone="red" />
                  <span className="text-xs text-gray-500">{formatDate(event.trippedAt)}</span>
                </div>
                <p className="mt-2 text-sm font-medium text-red-700">{event.tripReason}</p>
                <div className="mt-3 grid gap-2 text-xs text-gray-600 md:grid-cols-2 xl:grid-cols-3">
                  <p><span className="text-gray-500">{lang === 'zh' ? '最后调用：' : 'Final call: '}</span>{event.attemptId || '-'}</p>
                  <p><span className="text-gray-500">{lang === 'zh' ? '任务：' : 'Task: '}</span>{event.requestId || '-'}</p>
                  <p><span className="text-gray-500">{lang === 'zh' ? '错误类型：' : 'Error type: '}</span>{event.errorType || '-'}</p>
                  <p><span className="text-gray-500">{lang === 'zh' ? '耗时：' : 'Duration: '}</span>{formatDuration(event.durationMs)}</p>
                  <p className="break-all"><span className="text-gray-500">Base URL: </span>{event.baseUrl || '-'}</p>
                  <p><span className="text-gray-500">Model: </span>{event.model || '-'}</p>
                </div>
                {event.errorMessage ? <p className="mt-3 break-words rounded bg-red-50 px-3 py-2 text-xs text-red-700">{event.errorMessage}</p> : null}
                {event.prompt ? <p className="mt-2 line-clamp-3 text-xs text-gray-600"><span className="font-medium text-gray-700">{ui.prompt}: </span>{event.prompt}</p> : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {lang === 'zh' ? `第 ${pageInfo.total === 0 ? 0 : page} / ${pageInfo.totalPages} 页，共 ${pageInfo.total} 条` : `Page ${pageInfo.total === 0 ? 0 : page} of ${pageInfo.totalPages} (${pageInfo.total} total)`}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => changePage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50"
          >
            {lang === 'zh' ? '上一页' : 'Previous'}
          </button>
          <button
            onClick={() => changePage(Math.min(pageInfo.totalPages, page + 1))}
            disabled={page >= pageInfo.totalPages}
            className="rounded bg-gray-100 px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-200 disabled:opacity-50"
          >
            {lang === 'zh' ? '下一页' : 'Next'}
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">{ui.auditLogs}</div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{ui.time}</th>
              <th className="px-4 py-3 text-left font-medium">{ui.action}</th>
              <th className="px-4 py-3 text-left font-medium">{ui.actor}</th>
              <th className="px-4 py-3 text-left font-medium">{ui.target}</th>
              <th className="px-4 py-3 text-left font-medium">{ui.resource}</th>
              <th className="px-4 py-3 text-left font-medium">{ui.requestId}</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.id} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-700">{formatDate(log.createdAt)}</td>
                <td className="px-4 py-3 text-gray-900">{log.action}</td>
                <td className="px-4 py-3 text-gray-700">{log.actorUser?.email || '-'}</td>
                <td className="px-4 py-3 text-gray-700">{log.targetUser?.email || '-'}</td>
                <td className="px-4 py-3 text-gray-700">{log.resourceType} {log.resourceId || ''}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.requestId || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
