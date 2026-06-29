'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser } from '@/lib/dashboard/auth'

interface DebugTask {
  id: string
  prompt: string
  status: string
  selectedProviderName: string | null
  errorMessage: string | null
  createdAt: string
  cost: number | null
  costStatus: string | null
}

interface BalanceLog {
  id: string
  createdAt: string
  amount: number
  balanceAfter: number | null
  status: string
  reason: string | null
  requestId: string | null
  paymentOrder?: { outTradeNo: string | null } | null
  user: { email: string }
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

function money(value: number | null) {
  if (value === null) return '-'
  return `¥${value.toFixed(2)}`
}

export default function DebugPage() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [tasks, setTasks] = useState<DebugTask[]>([])
  const [balanceLogs, setBalanceLogs] = useState<BalanceLog[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load(q = '') {
    setLoading(true)
    try {
      const queryParams = q ? `?q=${encodeURIComponent(q)}` : ''
      const [failedTasksRes, balanceLogsRes, auditLogsRes] = await Promise.all([
        fetch('/api/v1/tasks?status=FAILED&limit=20'),
        fetch(`/api/v1/admin/balance-logs${queryParams}`),
        fetch(`/api/v1/admin/audit-logs${queryParams}`),
      ])
      const failedTasksBody = await failedTasksRes.json().catch(() => ({}))
      const balanceLogsBody = await balanceLogsRes.json().catch(() => ({}))
      const auditLogsBody = await auditLogsRes.json().catch(() => ({}))
      if (!failedTasksRes.ok) throw new Error(failedTasksBody.error || 'Failed to load failed tasks')
      if (!balanceLogsRes.ok) throw new Error(balanceLogsBody.error || 'Failed to load balance logs')
      if (!auditLogsRes.ok) throw new Error(auditLogsBody.error || 'Failed to load audit logs')
      setTasks(failedTasksBody.tasks || [])
      setBalanceLogs(balanceLogsBody.logs || [])
      setAuditLogs(auditLogsBody.logs || [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load debug data')
    } finally {
      setLoading(false)
    }
  }

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
      load()
    })
  }, [router])

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Debug</h2>
          <p className="mt-1 text-sm text-gray-500">Search recent failures, balance logs, and audit logs.</p>
        </div>
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="task id / outTradeNo / email / requestId"
            className="w-80 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button onClick={() => load(query)} className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">Search</button>
        </div>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}
      {loading ? <div className="text-gray-500">Loading debug data...</div> : null}

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">Recent Failed Tasks</div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium">Task</th>
              <th className="px-4 py-3 text-left font-medium">Provider</th>
              <th className="px-4 py-3 text-left font-medium">Cost</th>
              <th className="px-4 py-3 text-left font-medium">Error</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-700">{new Date(task.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-900">{task.id}</td>
                <td className="px-4 py-3 text-gray-700">{task.selectedProviderName || '-'}</td>
                <td className="px-4 py-3 text-gray-900">{money(task.cost)} {task.costStatus ? `(${task.costStatus})` : ''}</td>
                <td className="px-4 py-3 text-red-700">{task.errorMessage || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">Balance Logs</div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium">User</th>
              <th className="px-4 py-3 text-left font-medium">Amount</th>
              <th className="px-4 py-3 text-left font-medium">After</th>
              <th className="px-4 py-3 text-left font-medium">Reason</th>
              <th className="px-4 py-3 text-left font-medium">Refs</th>
            </tr>
          </thead>
          <tbody>
            {balanceLogs.map((log) => (
              <tr key={log.id} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-700">{new Date(log.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3 text-gray-900">{log.user.email}</td>
                <td className="px-4 py-3 text-gray-900">{money(log.amount)}</td>
                <td className="px-4 py-3 text-gray-700">{money(log.balanceAfter)}</td>
                <td className="px-4 py-3 text-gray-700">{log.reason || '-'}</td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {log.requestId || '-'} {log.paymentOrder?.outTradeNo ? ` / ${log.paymentOrder.outTradeNo}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3 font-semibold text-gray-900">Audit Logs</div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Time</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
              <th className="px-4 py-3 text-left font-medium">Actor</th>
              <th className="px-4 py-3 text-left font-medium">Target</th>
              <th className="px-4 py-3 text-left font-medium">Resource</th>
              <th className="px-4 py-3 text-left font-medium">Request ID</th>
            </tr>
          </thead>
          <tbody>
            {auditLogs.map((log) => (
              <tr key={log.id} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-700">{new Date(log.createdAt).toLocaleString()}</td>
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
