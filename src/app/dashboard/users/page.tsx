'use client'

import { Fragment, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser } from '@/lib/dashboard/auth'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { roleLabel, taskStatusLabel, useDashboardI18n } from '@/lib/dashboard/i18n'

interface UserRow {
  id: string
  email: string
  name: string | null
  role: 'ADMIN' | 'USER'
  enabled: boolean
  createdAt: string
  updatedAt: string
  apiKeyCount: number
  sessionCount: number
  taskCount: number
}

interface UserApiKey {
  id: string
  name: string
  keyPrefix: string
  enabled: boolean
  createdAt: string
  quota: {
    dailyLimit: number | null
    monthlyLimit: number | null
    dailyUsed: number
    monthlyUsed: number
  } | null
}

interface UserTask {
  id: string
  prompt: string
  status: 'STARTED' | 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
  createdAt: string
  selectedProviderName: string | null
  apiKey: { id: string; name: string; keyPrefix: string } | null
}

export default function UsersPage() {
  const router = useRouter()
  const { lang, t } = useDashboardI18n()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [userKeys, setUserKeys] = useState<Record<string, UserApiKey[]>>({})
  const [userTasks, setUserTasks] = useState<Record<string, UserTask[]>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [roleFilter, setRoleFilter] = useState<'all' | 'ADMIN' | 'USER'>('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' })
      if (search) params.set('q', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (roleFilter !== 'all') params.set('role', roleFilter)
      const res = await fetch(`/api/v1/admin/users?${params.toString()}`, { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) {
        router.push('/dashboard')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setUsers(json.users ?? [])
      const nextTotalPages = json.totalPages ?? 1
      setTotalPages(nextTotalPages)
      if (page > nextTotalPages) setPage(nextTotalPages)
      setError('')
    } catch {
      setError(lang === 'zh' ? '加载用户失败' : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [lang, page, roleFilter, router, search, statusFilter])

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
      fetchUsers()
    })
  }, [fetchUsers, router])

  function submitSearch(event: React.FormEvent) {
    event.preventDefault()
    setPage(1)
    setSearch(searchInput.trim())
  }

  async function toggleUser(user: UserRow) {
    setActionLoading(user.id)
    try {
      const endpoint = user.enabled ? 'disable' : 'enable'
      const res = await fetch(`/api/v1/admin/users/${user.id}/${endpoint}`, { method: 'POST' })
      if (res.ok) {
        await fetchUsers()
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error || (lang === 'zh' ? '更新用户失败' : 'Failed to update user'))
      }
    } finally {
      setActionLoading(null)
    }
  }

  async function toggleExpand(userId: string) {
    if (expandedId === userId) {
      setExpandedId(null)
      return
    }

    setExpandedId(userId)

    if (userKeys[userId] && userTasks[userId]) {
      return
    }

    setDetailLoading(userId)
    try {
      const [keysRes, tasksRes] = await Promise.all([
        fetch(`/api/v1/admin/users/${userId}/api-keys`),
        fetch(`/api/v1/admin/users/${userId}/tasks?limit=10`),
      ])

      if (keysRes.ok) {
        const json = await keysRes.json()
        setUserKeys((prev) => ({ ...prev, [userId]: json.keys ?? [] }))
      }
      if (tasksRes.ok) {
        const json = await tasksRes.json()
        setUserTasks((prev) => ({ ...prev, [userId]: json.tasks ?? [] }))
      }
    } finally {
      setDetailLoading(null)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">{lang === 'zh' ? '正在加载用户...' : 'Loading users...'}</div></div>
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{t('navUsers')}</h2>
        <p className="text-sm text-gray-500 mt-1">{lang === 'zh' ? '仅管理员可见的用户管理视图' : 'Admin-only user management view'}</p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <form onSubmit={submitSearch} className="mb-4 flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center">
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm text-gray-900"
          placeholder={lang === 'zh' ? '搜索邮箱或姓名' : 'Search email or name'}
        />
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(1) }} className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900">
          <option value="all">{lang === 'zh' ? '全部状态' : 'All statuses'}</option>
          <option value="enabled">{t('enabled')}</option>
          <option value="disabled">{t('disabled')}</option>
        </select>
        <select value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value as typeof roleFilter); setPage(1) }} className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-900">
          <option value="all">{lang === 'zh' ? '全部角色' : 'All roles'}</option>
          <option value="USER">{roleLabel(lang, 'USER')}</option>
          <option value="ADMIN">{roleLabel(lang, 'ADMIN')}</option>
        </select>
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">{lang === 'zh' ? '搜索' : 'Search'}</button>
      </form>

      <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2.5 font-medium w-8"></th>
                <th className="px-4 py-2.5 font-medium">{t('email')}</th>
                <th className="px-4 py-2.5 font-medium">{t('name')}</th>
                <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '角色' : 'Role'}</th>
                <th className="px-4 py-2.5 font-medium">{t('status')}</th>
                <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? 'API 密钥数' : 'API Keys'}</th>
                <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '任务数' : 'Tasks'}</th>
                <th className="px-4 py-2.5 font-medium">{lang === 'zh' ? '会话数' : 'Sessions'}</th>
                <th className="px-4 py-2.5 font-medium">{t('created')}</th>
                <th className="px-4 py-2.5 font-medium">{t('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">{lang === 'zh' ? '没有找到用户' : 'No users found'}</td>
                </tr>
              ) : (
                users.map((user, i) => (
                  <Fragment key={user.id}>
                    <tr className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}>
                      <td className="px-4 py-2.5">
                        <button onClick={() => toggleExpand(user.id)} className="text-gray-400 hover:text-gray-600">
                          {expandedId === user.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{user.email}</td>
                      <td className="px-4 py-2.5 text-gray-600">{user.name || '-'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                          {roleLabel(lang, user.role)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${user.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {user.enabled ? t('enabled') : t('disabled')}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">{user.apiKeyCount}</td>
                      <td className="px-4 py-2.5 text-gray-600">{user.taskCount}</td>
                      <td className="px-4 py-2.5 text-gray-600">{user.sessionCount}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">{new Date(user.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() => toggleUser(user)}
                          disabled={actionLoading === user.id || user.role === 'ADMIN'}
                          className={`px-3 py-1 text-xs rounded transition-colors ${user.enabled ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'} disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                          {actionLoading === user.id ? (lang === 'zh' ? '更新中...' : 'Updating...') : user.enabled ? (lang === 'zh' ? '禁用' : 'Disable') : (lang === 'zh' ? '启用' : 'Enable')}
                        </button>
                      </td>
                    </tr>
                    {expandedId === user.id && (
                      <tr className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td colSpan={10} className="px-4 py-4 bg-gray-50">
                          {detailLoading === user.id ? (
                            <div className="text-sm text-gray-500">{lang === 'zh' ? '正在加载详情...' : 'Loading details...'}</div>
                          ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">{lang === 'zh' ? 'API 密钥' : 'API Keys'}</h4>
                                <div className="rounded border border-gray-200 bg-white overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-gray-50 text-left text-gray-500">
                                        <th className="px-3 py-2 font-medium">{t('name')}</th>
                                        <th className="px-3 py-2 font-medium">{lang === 'zh' ? '前缀' : 'Prefix'}</th>
                                        <th className="px-3 py-2 font-medium">{t('status')}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(userKeys[user.id] ?? []).length === 0 ? (
                                        <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">{lang === 'zh' ? '没有 API 密钥' : 'No API keys'}</td></tr>
                                      ) : (
                                        (userKeys[user.id] ?? []).map((key) => (
                                          <tr key={key.id} className="border-t border-gray-100">
                                            <td className="px-3 py-2 text-gray-700">{key.name}</td>
                                            <td className="px-3 py-2 font-mono text-gray-500">{key.keyPrefix}...</td>
                                            <td className="px-3 py-2">
                                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${key.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {key.enabled ? t('enabled') : t('disabled')}
                                              </span>
                                            </td>
                                          </tr>
                                        ))
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">{lang === 'zh' ? '最近任务' : 'Recent Tasks'}</h4>
                                <div className="rounded border border-gray-200 bg-white overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-gray-50 text-left text-gray-500">
                                        <th className="px-3 py-2 font-medium">{t('prompt')}</th>
                                        <th className="px-3 py-2 font-medium">{t('status')}</th>
                                        <th className="px-3 py-2 font-medium">{t('apiKey')}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(userTasks[user.id] ?? []).length === 0 ? (
                                        <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">{lang === 'zh' ? '没有任务' : 'No tasks'}</td></tr>
                                      ) : (
                                        (userTasks[user.id] ?? []).map((task) => (
                                          <tr key={task.id} className="border-t border-gray-100">
                                            <td className="px-3 py-2 text-gray-700 max-w-[240px] truncate">{task.prompt}</td>
                                            <td className="px-3 py-2">
                                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${task.status === 'SUCCEEDED' ? 'bg-green-100 text-green-800' : task.status === 'FAILED' ? 'bg-red-100 text-red-800' : task.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                                                {taskStatusLabel(lang, task.status)}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2 text-gray-600">{task.apiKey?.name || '-'}</td>
                                          </tr>
                                        ))
                                      )}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
          <span>{lang === 'zh' ? `第 ${page} / ${totalPages} 页` : `Page ${page} of ${totalPages}`}</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">{t('previous')}</button>
            <button type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">{t('next')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
