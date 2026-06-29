'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'

interface TopupPackage {
  id: string
  name: string
  price: number
  credit: number
  bonus: number
  totalCredit: number
  enabled: boolean
  displayOrder: number
}

interface PaymentOrder {
  id: string
  outTradeNo: string
  status: string
  amount: number
  credit: number
  createdAt: string
  paidAt: string | null
  payUrl: string
  qrcode: string
  providerOrderId: string | null
  topupPackage?: { name: string } | null
  user?: { email: string } | null
}

function money(value: number) {
  return `¥${value.toFixed(2)}`
}

export default function PaymentsPage() {
  const router = useRouter()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [packages, setPackages] = useState<TopupPackage[]>([])
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load(currentUser: DashboardUser) {
    setLoading(true)
    try {
      const reqs = currentUser.role === 'ADMIN'
        ? [fetch('/api/v1/admin/topup-packages'), fetch('/api/v1/admin/payment-orders')]
        : [fetch('/api/v1/payments/packages'), fetch('/api/v1/payments/orders')]

      const [packagesRes, ordersRes] = await Promise.all(reqs)
      const packagesBody = await packagesRes.json().catch(() => ({}))
      const ordersBody = await ordersRes.json().catch(() => ({}))
      if (!packagesRes.ok) throw new Error(packagesBody.error || 'Failed to load packages')
      if (!ordersRes.ok) throw new Error(ordersBody.error || 'Failed to load orders')
      setPackages(packagesBody.packages || [])
      setOrders(ordersBody.orders || [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCurrentUser().then((u) => {
      if (!u) {
        router.push('/dashboard/login')
        return
      }
      setUser(u)
      load(u)
    })
  }, [router])

  async function createOrder(packageId: string) {
    if (!user || user.role === 'ADMIN') return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/v1/payments/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to create order')
      setMessage(`订单已创建：${body.outTradeNo}`)
      window.open(body.payUrl || body.qrcode || body.payUrl2, '_blank', 'noopener,noreferrer')
      await load(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create order')
    } finally {
      setSaving(false)
    }
  }

  async function verifyOrder(outTradeNo: string) {
    if (!user || user.role === 'ADMIN') return
    setSaving(true)
    try {
      const res = await fetch(`/api/v1/payments/orders/${encodeURIComponent(outTradeNo)}/verify`, {
        method: 'POST',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to verify order')
      setMessage(body.verified ? '订单已到账' : '订单仍未支付')
      await load(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to verify order')
    } finally {
      setSaving(false)
    }
  }

  async function settleOrder(orderId: string) {
    if (!user || user.role !== 'ADMIN') return
    setSaving(true)
    try {
      const res = await fetch(`/api/v1/admin/payment-orders/${orderId}/settle`, {
        method: 'POST',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Failed to settle order')
      setMessage('订单已手工入账')
      await load(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to settle order')
    } finally {
      setSaving(false)
    }
  }

  if (loading || !user) {
    return <div className="text-gray-500">Loading payments...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{user.role === 'ADMIN' ? 'Payments' : 'Recharge'}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {user.role === 'ADMIN' ? 'Manage recharge packages and inspect payment orders' : 'Recharge your account balance through WeChat Pay'}
        </p>
      </div>

      {message ? <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {packages.map((item) => (
          <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">{item.name}</div>
            <div className="mt-2 text-2xl font-bold text-gray-900">{money(item.price)}</div>
            <div className="mt-2 text-sm text-gray-700">到账余额 {money(item.totalCredit)}</div>
            {item.bonus > 0 ? <div className="mt-1 text-xs text-green-700">含赠送 {money(item.bonus)}</div> : null}
            {user.role !== 'ADMIN' ? (
              <button
                onClick={() => createOrder(item.id)}
                disabled={saving}
                className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                立即充值
              </button>
            ) : (
              <div className="mt-4 text-xs text-gray-500">排序 {item.displayOrder} · {item.enabled ? 'Enabled' : 'Disabled'}</div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-900">{user.role === 'ADMIN' ? 'Payment Orders' : 'My Orders'}</h3>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Time</th>
              {user.role === 'ADMIN' ? <th className="px-4 py-3 text-left font-medium">User</th> : null}
              <th className="px-4 py-3 text-left font-medium">Out Trade No</th>
              <th className="px-4 py-3 text-left font-medium">Amount</th>
              <th className="px-4 py-3 text-left font-medium">Credit</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={order.id} className="border-t border-gray-100">
                <td className="px-4 py-3 text-gray-700">{new Date(order.createdAt).toLocaleString()}</td>
                {user.role === 'ADMIN' ? <td className="px-4 py-3 text-gray-700">{order.user?.email || '-'}</td> : null}
                <td className="px-4 py-3 font-mono text-xs text-gray-900">{order.outTradeNo}</td>
                <td className="px-4 py-3 text-gray-900">{money(order.amount)}</td>
                <td className="px-4 py-3 text-gray-900">{money(order.credit)}</td>
                <td className="px-4 py-3 text-gray-700">{order.status}</td>
                <td className="px-4 py-3">
                  {user.role === 'ADMIN' ? (
                    order.status !== 'PAID' ? (
                      <button onClick={() => settleOrder(order.id)} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">Manual Settle</button>
                    ) : <span className="text-xs text-gray-400">Settled</span>
                  ) : (
                    order.status !== 'PAID' ? (
                      <button onClick={() => verifyOrder(order.outTradeNo)} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">Check Payment</button>
                    ) : <span className="text-xs text-gray-400">Paid</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
