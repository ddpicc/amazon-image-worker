'use client'

import { useEffect, useMemo, useState } from 'react'
import { paymentStatusLabel, roleLabel, taskStatusLabel, useDashboardI18n } from '@/lib/dashboard/i18n'

interface UserRow {
  id: string
  email: string
  name: string | null
  role: 'ADMIN' | 'USER'
  enabled: boolean
  balance: number
}

interface UsageRow {
  id: string
  prompt: string
  size: string | null
  pricingSku: string | null
  unitPrice: number | null
  priceVersion: number | null
  cost: number | null
  costStatus: string | null
  status: string
  createdAt: string
  apiKeyName: string
  ownerEmail: string
}

export default function BillingPage() {
  const { lang, t } = useDashboardI18n()
  const [users, setUsers] = useState<UserRow[]>([])
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [activeTab, setActiveTab] = useState<'balances' | 'usage'>('balances')
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingUsage, setLoadingUsage] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [userSearchInput, setUserSearchInput] = useState('')
  const [userSearch, setUserSearch] = useState('')
  const [userStatus, setUserStatus] = useState<'all' | 'enabled' | 'disabled'>('all')
  const [userRole, setUserRole] = useState<'all' | 'ADMIN' | 'USER'>('all')
  const [userPage, setUserPage] = useState(1)
  const [userTotalPages, setUserTotalPages] = useState(1)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  async function loadUsers() {
    setLoadingUsers(true)
    try {
      const params = new URLSearchParams({ page: String(userPage), limit: '20' })
      if (userSearch) params.set('q', userSearch)
      if (userStatus !== 'all') params.set('status', userStatus)
      if (userRole !== 'all') params.set('role', userRole)
      const res = await fetch(`/api/v1/admin/users?${params.toString()}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || (lang === 'zh' ? '加载用户失败' : 'Failed to load users'))
        return
      }
      setUsers(body.users || [])
      const nextTotalPages = body.totalPages || 1
      setUserTotalPages(nextTotalPages)
      if (userPage > nextTotalPages) setUserPage(nextTotalPages)
    } finally {
      setLoadingUsers(false)
    }
  }

  async function loadUsage() {
    setLoadingUsage(true)
    try {
      const res = await fetch('/api/v1/admin/usage?limit=100', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || (lang === 'zh' ? '加载用量失败' : 'Failed to load usage'))
        return
      }
      setUsage(body.records || [])
    } finally {
      setLoadingUsage(false)
    }
  }

  useEffect(() => {
    loadUsers()
  }, [userPage, userRole, userSearch, userStatus])

  useEffect(() => {
    loadUsage()
  }, [])

  function submitUserSearch(event: React.FormEvent) {
    event.preventDefault()
    setUserPage(1)
    setUserSearch(userSearchInput.trim())
  }

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId],
  )

  useEffect(() => {
    if (selectedUserId && !users.some((user) => user.id === selectedUserId)) {
      setSelectedUserId('')
    }
  }, [selectedUserId, users])

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')

    if (!selectedUserId) {
      setError(lang === 'zh' ? '请选择一个用户' : 'Please select a user')
      return
    }

    const numericAmount = Number(amount)
    if (!numericAmount || Number.isNaN(numericAmount)) {
      setError(lang === 'zh' ? '请输入非零金额' : 'Please enter a non-zero amount')
      return
    }

    setAdjusting(true)
    try {
      const res = await fetch(`/api/v1/admin/users/${selectedUserId}/balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: numericAmount, reason }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || (lang === 'zh' ? '调整余额失败' : 'Failed to adjust balance'))
        return
      }
      setMessage(lang === 'zh' ? `余额已更新。新余额：¥${body.newBalance.toFixed(2)}` : `Balance updated. New balance: ¥${body.newBalance.toFixed(2)}`)
      setAmount('')
      setReason('')
      await loadUsers()
      await loadUsage()
    } finally {
      setAdjusting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('navBilling')}</h2>
        <p className="text-sm text-gray-500 mt-1">{lang === 'zh' ? '管理用户余额并查看计费用量' : 'Manage user balances and review billed image generation usage'}</p>
      </div>

      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{message}</div>}
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('balances')}
          className={`px-4 py-2 rounded-md text-sm ${activeTab === 'balances' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700'}`}
        >
          {lang === 'zh' ? '用户余额' : 'User Balances'}
        </button>
        <button
          onClick={() => setActiveTab('usage')}
          className={`px-4 py-2 rounded-md text-sm ${activeTab === 'usage' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700'}`}
        >
          {lang === 'zh' ? '用量报表' : 'Usage Report'}
        </button>
      </div>

      {activeTab === 'balances' ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">{t('navUsers')}</h3>
            </div>
            <form onSubmit={submitUserSearch} className="flex flex-col gap-2 border-b border-gray-100 p-4 sm:flex-row">
              <input
                value={userSearchInput}
                onChange={(event) => setUserSearchInput(event.target.value)}
                className="min-w-0 flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder={lang === 'zh' ? '搜索邮箱或姓名' : 'Search email or name'}
              />
              <select value={userStatus} onChange={(event) => { setUserStatus(event.target.value as typeof userStatus); setUserPage(1) }} className="rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="all">{lang === 'zh' ? '全部状态' : 'All statuses'}</option>
                <option value="enabled">{t('enabled')}</option>
                <option value="disabled">{t('disabled')}</option>
              </select>
              <select value={userRole} onChange={(event) => { setUserRole(event.target.value as typeof userRole); setUserPage(1) }} className="rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="all">{lang === 'zh' ? '全部角色' : 'All roles'}</option>
                <option value="USER">{roleLabel(lang, 'USER')}</option>
                <option value="ADMIN">{roleLabel(lang, 'ADMIN')}</option>
              </select>
              <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700">{lang === 'zh' ? '搜索' : 'Search'}</button>
            </form>
            {loadingUsers ? (
              <div className="p-4 text-gray-500">{lang === 'zh' ? '正在加载用户...' : 'Loading users...'}</div>
            ) : (
              <>
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">{t('email')}</th>
                      <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '角色' : 'Role'}</th>
                      <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '余额' : 'Balance'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 ? (
                      <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">{lang === 'zh' ? '没有找到用户' : 'No users found'}</td></tr>
                    ) : users.map((user) => (
                      <tr
                        key={user.id}
                        className={`border-t border-gray-100 cursor-pointer ${selectedUserId === user.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        onClick={() => setSelectedUserId(user.id)}
                      >
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{user.email}</div>
                          {user.name ? <div className="text-xs text-gray-500">{user.name}</div> : null}
                        </td>
                        <td className="px-4 py-3 text-gray-700">{roleLabel(lang, user.role)}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">¥{user.balance.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex items-center justify-between border-t border-gray-200 px-4 py-3 text-sm text-gray-600">
                  <span>{lang === 'zh' ? `第 ${userPage} / ${userTotalPages} 页` : `Page ${userPage} of ${userTotalPages}`}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setUserPage((current) => Math.max(1, current - 1))} disabled={userPage <= 1} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">{t('previous')}</button>
                    <button type="button" onClick={() => setUserPage((current) => Math.min(userTotalPages, current + 1))} disabled={userPage >= userTotalPages} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">{t('next')}</button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{lang === 'zh' ? '调整余额' : 'Adjust Balance'}</h3>
            <form onSubmit={submitAdjustment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'zh' ? '已选用户' : 'Selected User'}</label>
                <input
                  value={selectedUser ? `${selectedUser.email} (${roleLabel(lang, selectedUser.role)})` : ''}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-gray-500"
                  placeholder={lang === 'zh' ? '从左侧表格选择用户' : 'Select a user from the table'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('amount')}</label>
                <input
                  type="number"
                  step="0.0001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder={lang === 'zh' ? '正数为充值，负数为扣减' : 'Positive = credit, negative = debit'}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{lang === 'zh' ? '原因' : 'Reason'}</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder={lang === 'zh' ? '可选备注' : 'Optional note'}
                />
              </div>
              <button
                type="submit"
                disabled={adjusting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {adjusting ? (lang === 'zh' ? '更新中...' : 'Updating...') : (lang === 'zh' ? '更新余额' : 'Update Balance')}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">{lang === 'zh' ? '用量报表' : 'Usage Report'}</h3>
          </div>
          {loadingUsage ? (
            <div className="p-4 text-gray-500">{lang === 'zh' ? '正在加载用量...' : 'Loading usage...'}</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">{t('time')}</th>
                  <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '用户' : 'User'}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('apiKey')}</th>
                  <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '尺寸' : 'Size'}</th>
                  <th className="px-4 py-3 text-left font-medium">SKU</th>
                  <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '单价' : 'Unit Price'}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('cost')}</th>
                  <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '费用状态' : 'Cost Status'}</th>
                  <th className="px-4 py-3 text-left font-medium">{lang === 'zh' ? '任务状态' : 'Task Status'}</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-4 py-3 text-gray-700">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-900">{row.ownerEmail}</td>
                    <td className="px-4 py-3 text-gray-700">{row.apiKeyName}</td>
                    <td className="px-4 py-3 text-gray-700">{row.size || '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{row.pricingSku || '-'}{row.priceVersion ? ` v${row.priceVersion}` : ''}</td>
                    <td className="px-4 py-3 text-gray-900">{row.unitPrice !== null ? `¥${row.unitPrice.toFixed(2)}` : '-'}</td>
                    <td className="px-4 py-3 text-gray-900">{row.cost !== null ? `¥${row.cost.toFixed(2)}` : '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{row.costStatus ? paymentStatusLabel(lang, row.costStatus) : '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{taskStatusLabel(lang, row.status as 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
