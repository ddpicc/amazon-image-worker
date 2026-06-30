'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'
import { paymentStatusLabel, useDashboardI18n } from '@/lib/dashboard/i18n'

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

interface PackageDraft {
  key: string
  id: string
  name: string
  price: string
  credit: string
  bonus: string
  displayOrder: string
  enabled: boolean
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

function money(value: number | null | undefined) {
  if (value === null || value === undefined) return '-'
  return `¥${value.toFixed(2)}`
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function toStringNumber(value: number) {
  return Number.isFinite(value) ? String(value) : ''
}

function createDraftFromPackage(item: TopupPackage): PackageDraft {
  return {
    key: item.id,
    id: item.id,
    name: item.name,
    price: toStringNumber(item.price),
    credit: toStringNumber(item.credit),
    bonus: toStringNumber(item.bonus),
    displayOrder: toStringNumber(item.displayOrder),
    enabled: item.enabled,
  }
}

function createNewDraft(order: number): PackageDraft {
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    id: '',
    name: '',
    price: '',
    credit: '',
    bonus: '0',
    displayOrder: String(order),
    enabled: true,
  }
}

function parseDraft(row: PackageDraft) {
  const name = row.name.trim()
  const price = Number(row.price)
  const credit = Number(row.credit)
  const bonus = Number(row.bonus || 0)
  const displayOrder = Number(row.displayOrder)

  if (!name) throw new Error('套餐名称不能为空')
  if (!Number.isFinite(price) || price <= 0) throw new Error(`套餐「${name}」的价格必须大于 0`)
  if (!Number.isFinite(credit) || credit <= 0) throw new Error(`套餐「${name}」的到账金额必须大于 0`)
  if (!Number.isFinite(bonus) || bonus < 0) throw new Error(`套餐「${name}」的赠送金额不能小于 0`)
  if (!Number.isInteger(displayOrder) || displayOrder < 0) throw new Error(`套餐「${name}」的排序必须是非负整数`)

  return {
    ...(row.id ? { id: row.id } : {}),
    name,
    price,
    credit,
    bonus,
    enabled: row.enabled,
    displayOrder,
  }
}

export default function PaymentsPage() {
  const router = useRouter()
  const { lang, t } = useDashboardI18n()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [packages, setPackages] = useState<TopupPackage[]>([])
  const [packageDrafts, setPackageDrafts] = useState<PackageDraft[]>([])
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [customAmount, setCustomAmount] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPackages, setSavingPackages] = useState(false)
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
      if (!packagesRes.ok) throw new Error(packagesBody.error || t('failedToLoadPackages'))
      if (!ordersRes.ok) throw new Error(ordersBody.error || t('failedToLoadOrders'))

      const nextPackages = packagesBody.packages || []
      setPackages(nextPackages)
      setOrders(ordersBody.orders || [])
      setPackageDrafts(currentUser.role === 'ADMIN' ? nextPackages.map(createDraftFromPackage) : [])
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

  async function createOrder(payload: { packageId: string } | { amountYuan: string }) {
    if (!user || user.role === 'ADMIN') return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch('/api/v1/payments/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || t('failedToCreateOrder'))
      setMessage(`${t('orderCreated')}：${body.outTradeNo}`)
      if ('amountYuan' in payload) {
        setCustomAmount('')
      }
      window.open(body.payUrl || body.qrcode || body.payUrl2, '_blank', 'noopener,noreferrer')
      await load(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToCreateOrder'))
    } finally {
      setSaving(false)
    }
  }

  async function verifyOrder(outTradeNo: string) {
    if (!user || user.role === 'ADMIN') return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const res = await fetch(`/api/v1/payments/orders/${encodeURIComponent(outTradeNo)}/verify`, {
        method: 'POST',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || t('failedToVerifyOrder'))
      setMessage(body.verified ? t('orderVerified') : t('orderStillPending'))
      await load(user)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToVerifyOrder'))
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

  function addPackageDraft() {
    const nextOrder = packageDrafts.reduce((max, row) => Math.max(max, Number(row.displayOrder) || 0), 0) + 10
    setPackageDrafts((current) => [...current, createNewDraft(nextOrder)])
  }

  function updatePackageDraft(key: string, patch: Partial<PackageDraft>) {
    setPackageDrafts((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  function removePackageDraft(key: string) {
    setPackageDrafts((current) => current.filter((row) => row.key !== key))
  }

  async function savePackages() {
    if (!user || user.role !== 'ADMIN') return

    setSavingPackages(true)
    setMessage('')
    setError('')

    try {
      const payload = packageDrafts.map(parseDraft)
      const res = await fetch('/api/v1/admin/topup-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packages: payload }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || t('failedToSavePackages'))

      const nextPackages = body.packages || []
      setPackages(nextPackages)
      setPackageDrafts(nextPackages.map(createDraftFromPackage))
      setMessage(t('packagesUpdated'))
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToSavePackages'))
    } finally {
      setSavingPackages(false)
    }
  }

  if (loading || !user) {
    return <div className="text-gray-500">{t('loadingPayments')}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{user.role === 'ADMIN' ? t('payments') : t('recharge')}</h2>
        <p className="mt-1 text-sm text-gray-500">
          {user.role === 'ADMIN' ? t('paymentsAdminSubtitle') : t('paymentsUserSubtitle')}
        </p>
      </div>

      {message ? <div className="rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{message}</div> : null}
      {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

      {user.role === 'ADMIN' ? (
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <div>
              <h3 className="font-semibold text-gray-900">{t('rechargePackages')}</h3>
              <p className="mt-0.5 text-xs text-gray-500">{t('rechargePackagesSubtitle')}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={addPackageDraft}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t('addPackage')}
              </button>
              <button
                onClick={savePackages}
                disabled={savingPackages}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {savingPackages ? t('saving') : t('savePackages')}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">{t('packageName')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('price')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('credit')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('bonus')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('total')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('order')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('enabled')}</th>
                  <th className="px-4 py-3 text-left font-medium">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {packageDrafts.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                      {t('noRechargePackagesYet')}
                    </td>
                  </tr>
                ) : (
                  packageDrafts.map((row, index) => {
                    const price = Number(row.price)
                    const credit = Number(row.credit)
                    const bonus = Number(row.bonus || 0)
                    const totalCredit = Number.isFinite(credit) && Number.isFinite(bonus) ? credit + bonus : null

                    return (
                      <tr key={row.key} className="border-t border-gray-100 align-top">
                        <td className="px-4 py-3">
                          <input
                            value={row.name}
                            onChange={(e) => updatePackageDraft(row.key, { name: e.target.value })}
                            disabled={savingPackages}
                            className="w-44 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                            placeholder={t('packageNamePlaceholder')}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.0001"
                            value={row.price}
                            onChange={(e) => updatePackageDraft(row.key, { price: e.target.value })}
                            disabled={savingPackages}
                            className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.0001"
                            value={row.credit}
                            onChange={(e) => updatePackageDraft(row.key, { credit: e.target.value })}
                            disabled={savingPackages}
                            className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="0.0001"
                            value={row.bonus}
                            onChange={(e) => updatePackageDraft(row.key, { bonus: e.target.value })}
                            disabled={savingPackages}
                            className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-900">{totalCredit !== null ? money(totalCredit) : '-'}</td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row.displayOrder}
                            onChange={(e) => updatePackageDraft(row.key, { displayOrder: e.target.value })}
                            disabled={savingPackages}
                            className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <label className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              onChange={(e) => updatePackageDraft(row.key, { enabled: e.target.checked })}
                              disabled={savingPackages}
                            />
                            <span className="text-gray-700">{row.enabled ? t('enabled') : t('disabled')}</span>
                          </label>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400">#{index + 1}</span>
                            {!row.id ? (
                              <button
                                onClick={() => removePackageDraft(row.key)}
                                disabled={savingPackages}
                                className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                {t('remove')}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">ID: {row.id.slice(0, 8)}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="space-y-4">
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
                  onClick={() => createOrder({ amountYuan: customAmount })}
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {t('rechargeNow')}
                </button>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-3">
              <h3 className="font-semibold text-gray-900">{t('quickPackages')}</h3>
              <p className="mt-1 text-sm text-gray-500">{t('quickPackagesSubtitle')}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {packages.map((item) => (
                <div key={item.id} className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="text-sm text-gray-500">{item.name}</div>
                  <div className="mt-2 text-2xl font-bold text-gray-900">{money(item.price)}</div>
                  <div className="mt-2 text-sm text-gray-700">{t('creditBalance')} {money(item.totalCredit)}</div>
                  {item.bonus > 0 ? <div className="mt-1 text-xs text-green-700">{t('includesBonus')} {money(item.bonus)}</div> : null}
                  <button
                    onClick={() => createOrder({ packageId: item.id })}
                    disabled={saving}
                    className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {t('rechargeNow')}
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3">
          <h3 className="font-semibold text-gray-900">{user.role === 'ADMIN' ? t('paymentOrders') : t('myOrders')}</h3>
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-4 py-3 text-left font-medium">{t('time')}</th>
              {user.role === 'ADMIN' ? <th className="px-4 py-3 text-left font-medium">{t('roleUser')}</th> : null}
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
                <td colSpan={user.role === 'ADMIN' ? 8 : 7} className="px-4 py-8 text-center text-gray-400">
                  {t('noPaymentOrdersFound')}
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr key={order.id} className="border-t border-gray-100">
                  <td className="px-4 py-3 text-gray-700">{formatDate(order.createdAt)}</td>
                  {user.role === 'ADMIN' ? <td className="px-4 py-3 text-gray-700">{order.user?.email || '-'}</td> : null}
                  <td className="px-4 py-3 font-mono text-xs text-gray-900">{order.outTradeNo}</td>
                  <td className="px-4 py-3 text-gray-700">{order.topupPackage?.name || t('customTopup')}</td>
                  <td className="px-4 py-3 text-gray-900">{money(order.amount)}</td>
                  <td className="px-4 py-3 text-gray-900">{money(order.credit)}</td>
                  <td className="px-4 py-3 text-gray-700">{paymentStatusLabel(lang, order.status)}</td>
                  <td className="px-4 py-3">
                    {user.role === 'ADMIN' ? (
                      order.status !== 'PAID' ? (
                        <button onClick={() => settleOrder(order.id)} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">
                          {t('manualSettle')}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">{t('settled')}</span>
                      )
                    ) : order.status !== 'PAID' ? (
                      <button onClick={() => verifyOrder(order.outTradeNo)} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">
                        {t('checkPayment')}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">{t('paid')}</span>
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
