'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'
import { paymentStatusLabel, useDashboardI18n } from '@/lib/dashboard/i18n'

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

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return '-'
  return `¥${value.toFixed(2)}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

export default function PaymentsPage() {
  const router = useRouter()
  const { lang, t } = useDashboardI18n()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [customAmount, setCustomAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function load(currentUser: DashboardUser) {
    setLoading(true)
    try {
      const ordersUrl = currentUser.role === 'ADMIN' ? '/api/v1/admin/payment-orders' : '/api/v1/payments/orders'
      const ordersRes = await fetch(ordersUrl)
      const ordersBody = await ordersRes.json().catch(() => ({}))
      if (!ordersRes.ok) throw new Error(ordersBody.error || t('failedToLoadOrders'))

      setOrders(ordersBody.orders || [])
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToLoadPayments'))
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

  async function createCustomOrder() {
    if (!user || user.role === 'ADMIN') return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/v1/payments/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountYuan: customAmount }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || t('failedToCreateOrder'))
      setMessage(`${t('orderCreated')}：${body.outTradeNo}`)
      setCustomAmount('')
      window.open(body.payUrl || body.qrcode || body.payUrl2, '_blank', 'noopener,noreferrer')
      await load(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToCreateOrder'))
    } finally {
      setSaving(false)
    }
  }

  async function settleOrder(orderId: string) {
    if (!user || user.role !== 'ADMIN') return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch(`/api/v1/admin/payment-orders/${orderId}/settle`, {
        method: 'POST',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || t('failedToSettleOrder'))
      setMessage(t('orderManuallySettled'))
      await load(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSettleOrder'))
    } finally {
      setSaving(false)
    }
  }

  if (loading || !user) {
    return <div className="text-gray-500">{t('loadingPayments')}</div>
  }

  const isAdmin = user.role === 'ADMIN'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{isAdmin ? t('payments') : t('recharge')}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {isAdmin ? '查看支付订单并手工入账' : t('paymentsUserSubtitle')}
        </p>
      </div>

      {message ? <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      {!isAdmin && (
        <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-xl">
              <h3 className="font-semibold text-gray-900">{t('customTopupTitle')}</h3>
              <p className="mt-1 text-sm text-gray-500">{t('customTopupSubtitle')}</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('amountYuan')}</label>
                <input
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder={t('amountPlaceholder')}
                  inputMode="decimal"
                  disabled={saving}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-50 sm:w-48"
                />
              </div>
              <button
                onClick={createCustomOrder}
                disabled={saving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {t('rechargeNow')}
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-900">{isAdmin ? t('paymentOrders') : t('myOrders')}</h3>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{t('time')}</th>
              {isAdmin ? <th className="px-4 py-3 text-left font-medium">{t('roleUser')}</th> : null}
              <th className="px-4 py-3 text-left font-medium">{t('outTradeNo')}</th>
              <th className="px-4 py-3 text-left font-medium">{t('type')}</th>
              <th className="px-4 py-3 text-left font-medium">{t('amount')}</th>
              <th className="px-4 py-3 text-left font-medium">{t('credit')}</th>
              <th className="px-4 py-3 text-left font-medium">{t('status')}</th>
              <th className="px-4 py-3 text-left font-medium">{t('action')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 7} className="px-4 py-8 text-center text-gray-400">
                  {t('noPaymentOrdersFound')}
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-700">{formatDate(order.createdAt)}</td>
                  {isAdmin ? <td className="px-4 py-3 text-gray-700">{order.user?.email || '-'}</td> : null}
                  <td className="px-4 py-3 font-mono text-xs text-gray-900">{order.outTradeNo}</td>
                  <td className="px-4 py-3 text-gray-700">{order.topupPackage?.name || t('customTopup')}</td>
                  <td className="px-4 py-3 text-gray-900">{money(order.amount)}</td>
                  <td className="px-4 py-3 text-gray-900">{money(order.credit)}</td>
                  <td className="px-4 py-3 text-gray-700">{paymentStatusLabel(lang, order.status)}</td>
                  <td className="px-4 py-3">
                    {isAdmin ? (
                      order.status === 'PENDING' ? (
                        <button onClick={() => settleOrder(order.id)} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">
                          {t('manualSettle')}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">{t('settled')}</span>
                      )
                    ) : order.status === 'PAID' ? (
                      <span className="text-xs text-gray-400">{t('paid')}</span>
                    ) : (
                      <span className="text-xs text-gray-400">{t('statusPending')}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
