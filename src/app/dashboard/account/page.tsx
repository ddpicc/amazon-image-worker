'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Wallet } from 'lucide-react'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'
import { useDashboardI18n } from '@/lib/dashboard/i18n'

export default function AccountPage() {
  const router = useRouter()
  const { t } = useDashboardI18n()
  const [user, setUser] = useState<DashboardUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileForm, setProfileForm] = useState({ name: '' })
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCurrentUser().then((u) => {
      if (!u) {
        router.push('/dashboard/login')
        return
      }
      setUser(u)
      setProfileForm({ name: u.name || '' })
      setLoading(false)
    })
  }, [router])

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')
    setProfileSubmitting(true)
    try {
      const res = await fetch('/api/v1/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: profileForm.name }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || '更新资料失败')
        return
      }
      setUser(body.user)
      setMessage('资料已更新')
    } finally {
      setProfileSubmitting(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')

    if (passwordForm.newPassword.length < 8) {
      setError('新密码至少需要 8 个字符')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('两次输入的新密码不一致')
      return
    }

    setPasswordSubmitting(true)
    try {
      const res = await fetch('/api/v1/auth/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error || '修改密码失败')
        return
      }
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setMessage('密码已更新')
    } finally {
      setPasswordSubmitting(false)
    }
  }

  if (loading || !user) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">正在加载账号信息...</div></div>
  }

  const avatarChar = (user.name || user.email).trim().charAt(0).toUpperCase()

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">{t('navAccount')}</h2>
        <p className="text-sm text-gray-500 mt-1">管理你的个人资料和密码</p>
      </div>

      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{message}</div>}
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      {/* 账号概览 */}
      <div className="relative overflow-hidden rounded-xl bg-blue-600 p-6 text-white shadow-lg shadow-blue-600/20">
        <div aria-hidden className="pointer-events-none absolute -top-16 right-0 h-48 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/15 text-xl font-bold backdrop-blur">
              {avatarChar}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold">{user.name || '未设置名称'}</p>
              <p className="truncate text-sm text-blue-100">{user.email}</p>
            </div>
          </div>
          <div className="shrink-0 sm:text-right">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-100">
              <Wallet className="h-3.5 w-3.5" />
              可用余额
            </p>
            <p className="mt-1 text-3xl font-bold tabular-nums">¥{(user.balance ?? 0).toFixed(2)}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">个人资料</h3>
          <p className="mt-1 text-sm text-gray-500">更新你的显示名称</p>
          <form onSubmit={saveProfile} className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
              <input value={user.email} disabled readOnly className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-gray-500 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('name')}</label>
              <input value={profileForm.name} onChange={(e) => setProfileForm({ name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('yourName')} />
            </div>
            <button type="submit" disabled={profileSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium">
              {profileSubmitting ? t('saving') : '保存资料'}
            </button>
          </form>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900">修改密码</h3>
          <p className="mt-1 text-sm text-gray-500">密码至少 8 个字符</p>
          <form onSubmit={changePassword} className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">当前密码</label>
              <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">新密码</label>
              <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">确认新密码</label>
              <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
            </div>
            <button type="submit" disabled={passwordSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium">
              {passwordSubmitting ? '更新中...' : '修改密码'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
