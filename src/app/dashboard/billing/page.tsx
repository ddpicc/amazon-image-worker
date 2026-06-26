'use client'

import { useEffect, useMemo, useState } from 'react'

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
  const [users, setUsers] = useState<UserRow[]>([])
  const [usage, setUsage] = useState<UsageRow[]>([])
  const [activeTab, setActiveTab] = useState<'balances' | 'usage'>('balances')
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingUsage, setLoadingUsage] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [adjusting, setAdjusting] = useState(false)

  async function loadUsers() {
    setLoadingUsers(true)
    try {
      const res = await fetch('/api/v1/admin/users', { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || 'Failed to load users')
        return
      }
      setUsers(body.users || [])
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
        setError(body.error || 'Failed to load usage')
        return
      }
      setUsage(body.records || [])
    } finally {
      setLoadingUsage(false)
    }
  }

  useEffect(() => {
    loadUsers()
    loadUsage()
  }, [])

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId],
  )

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')

    if (!selectedUserId) {
      setError('Please select a user')
      return
    }

    const numericAmount = Number(amount)
    if (!numericAmount || Number.isNaN(numericAmount)) {
      setError('Please enter a non-zero amount')
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
        setError(body.error || 'Failed to adjust balance')
        return
      }
      setMessage(`Balance updated. New balance: $${body.newBalance.toFixed(4)}`)
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
        <h2 className="text-2xl font-bold text-gray-900">Billing</h2>
        <p className="text-sm text-gray-500 mt-1">Manage user balances and review billed image generation usage</p>
      </div>

      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{message}</div>}
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('balances')}
          className={`px-4 py-2 rounded-md text-sm ${activeTab === 'balances' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700'}`}
        >
          User Balances
        </button>
        <button
          onClick={() => setActiveTab('usage')}
          className={`px-4 py-2 rounded-md text-sm ${activeTab === 'usage' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-300 text-gray-700'}`}
        >
          Usage Report
        </button>
      </div>

      {activeTab === 'balances' ? (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Users</h3>
            </div>
            {loadingUsers ? (
              <div className="p-4 text-gray-500">Loading users...</div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Email</th>
                    <th className="px-4 py-3 text-left font-medium">Role</th>
                    <th className="px-4 py-3 text-left font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr
                      key={user.id}
                      className={`border-t border-gray-100 cursor-pointer ${selectedUserId === user.id ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{user.email}</div>
                        {user.name ? <div className="text-xs text-gray-500">{user.name}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{user.role}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">${user.balance.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Adjust Balance</h3>
            <form onSubmit={submitAdjustment} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Selected User</label>
                <input
                  value={selectedUser ? `${selectedUser.email} (${selectedUser.role})` : ''}
                  disabled
                  className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-gray-500"
                  placeholder="Select a user from the table"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                <input
                  type="number"
                  step="0.0001"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Positive = credit, negative = debit"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="Optional note"
                />
              </div>
              <button
                type="submit"
                disabled={adjusting}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {adjusting ? 'Updating...' : 'Update Balance'}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900">Usage Report</h3>
          </div>
          {loadingUsage ? (
            <div className="p-4 text-gray-500">Loading usage...</div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Time</th>
                  <th className="px-4 py-3 text-left font-medium">User</th>
                  <th className="px-4 py-3 text-left font-medium">API Key</th>
                  <th className="px-4 py-3 text-left font-medium">Size</th>
                  <th className="px-4 py-3 text-left font-medium">SKU</th>
                  <th className="px-4 py-3 text-left font-medium">Unit Price</th>
                  <th className="px-4 py-3 text-left font-medium">Cost</th>
                  <th className="px-4 py-3 text-left font-medium">Cost Status</th>
                  <th className="px-4 py-3 text-left font-medium">Task Status</th>
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
                    <td className="px-4 py-3 text-gray-900">{row.unitPrice !== null ? `$${row.unitPrice.toFixed(4)}` : '-'}</td>
                    <td className="px-4 py-3 text-gray-900">{row.cost !== null ? `$${row.cost.toFixed(4)}` : '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{row.costStatus || '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{row.status}</td>
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
