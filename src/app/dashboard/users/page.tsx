'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser } from '@/lib/dashboard/auth'
import { ChevronDown, ChevronRight } from 'lucide-react'

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
  status: 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
  createdAt: string
  selectedProviderName: string | null
  apiKey: { id: string; name: string; keyPrefix: string } | null
}

export default function UsersPage() {
  const router = useRouter()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [userKeys, setUserKeys] = useState<Record<string, UserApiKey[]>>({})
  const [userTasks, setUserTasks] = useState<Record<string, UserTask[]>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/users')
      if (res.status === 401 || res.status === 403) {
        router.push('/dashboard')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setUsers(json.users ?? [])
      setError('')
    } catch {
      setError('Failed to load users')
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
      fetchUsers()
    })
  }, [fetchUsers, router])

  async function toggleUser(user: UserRow) {
    setActionLoading(user.id)
    try {
      const endpoint = user.enabled ? 'disable' : 'enable'
      const res = await fetch(`/api/v1/admin/users/${user.id}/${endpoint}`, { method: 'POST' })
      if (res.ok) {
        await fetchUsers()
      } else {
        const body = await res.json().catch(() => ({}))
        alert(body.error || 'Failed to update user')
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
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Loading users...</div></div>
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Users</h2>
        <p className="text-sm text-gray-500 mt-1">Admin-only user management view</p>
      </div>

      {error && (
        <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}

      <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-4 py-2.5 font-medium w-8"></th>
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Role</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">API Keys</th>
                <th className="px-4 py-2.5 font-medium">Tasks</th>
                <th className="px-4 py-2.5 font-medium">Sessions</th>
                <th className="px-4 py-2.5 font-medium">Created</th>
                <th className="px-4 py-2.5 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-8 text-center text-gray-400">No users found</td>
                </tr>
              ) : (
                users.map((user, i) => (
                  <>
                    <tr key={user.id} className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'} hover:bg-gray-50`}>
                      <td className="px-4 py-2.5">
                        <button onClick={() => toggleExpand(user.id)} className="text-gray-400 hover:text-gray-600">
                          {expandedId === user.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{user.email}</td>
                      <td className="px-4 py-2.5 text-gray-600">{user.name || '-'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'}`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${user.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {user.enabled ? 'Enabled' : 'Disabled'}
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
                          {actionLoading === user.id ? 'Updating...' : user.enabled ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                    {expandedId === user.id && (
                      <tr className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                        <td colSpan={10} className="px-4 py-4 bg-gray-50">
                          {detailLoading === user.id ? (
                            <div className="text-sm text-gray-500">Loading details...</div>
                          ) : (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">API Keys</h4>
                                <div className="rounded border border-gray-200 bg-white overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-gray-50 text-left text-gray-500">
                                        <th className="px-3 py-2 font-medium">Name</th>
                                        <th className="px-3 py-2 font-medium">Prefix</th>
                                        <th className="px-3 py-2 font-medium">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(userKeys[user.id] ?? []).length === 0 ? (
                                        <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">No API keys</td></tr>
                                      ) : (
                                        (userKeys[user.id] ?? []).map((key) => (
                                          <tr key={key.id} className="border-t border-gray-100">
                                            <td className="px-3 py-2 text-gray-700">{key.name}</td>
                                            <td className="px-3 py-2 font-mono text-gray-500">{key.keyPrefix}...</td>
                                            <td className="px-3 py-2">
                                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${key.enabled ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {key.enabled ? 'Enabled' : 'Disabled'}
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
                                <h4 className="text-sm font-semibold text-gray-900 mb-2">Recent Tasks</h4>
                                <div className="rounded border border-gray-200 bg-white overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-gray-50 text-left text-gray-500">
                                        <th className="px-3 py-2 font-medium">Prompt</th>
                                        <th className="px-3 py-2 font-medium">Status</th>
                                        <th className="px-3 py-2 font-medium">API Key</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(userTasks[user.id] ?? []).length === 0 ? (
                                        <tr><td colSpan={3} className="px-3 py-4 text-center text-gray-400">No tasks</td></tr>
                                      ) : (
                                        (userTasks[user.id] ?? []).map((task) => (
                                          <tr key={task.id} className="border-t border-gray-100">
                                            <td className="px-3 py-2 text-gray-700 max-w-[240px] truncate">{task.prompt}</td>
                                            <td className="px-3 py-2">
                                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${task.status === 'SUCCEEDED' ? 'bg-green-100 text-green-800' : task.status === 'FAILED' ? 'bg-red-100 text-red-800' : task.status === 'PROCESSING' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                                                {task.status}
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
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
