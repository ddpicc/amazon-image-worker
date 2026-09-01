'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useDashboardI18n } from '@/lib/dashboard/i18n'
import EmailCodeForm from '@/components/auth/email-code-form'

export default function RegisterPage() {
  const { t } = useDashboardI18n()
  const [form, setForm] = useState({ email: '', password: '', name: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [pendingEmail, setPendingEmail] = useState('')
  const [devCode, setDevCode] = useState<string | undefined>(undefined)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const body = await res.json().catch(() => ({}))

      if (res.ok && body.requiresVerification) {
        setPendingEmail(body.email || form.email.trim().toLowerCase())
        setDevCode(body.devCode)
      } else {
        setError(body.error || t('registrationFailed'))
      }
    } catch {
      setError(t('connectionError'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">{pendingEmail ? '验证邮箱' : t('registerTitle')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {pendingEmail ? '输入邮件中的验证码完成注册' : t('registerSubtitle')}
            </p>
          </div>

          {pendingEmail ? (
            <EmailCodeForm
              email={pendingEmail}
              initialDevCode={devCode}
              onVerified={() => {
                window.location.href = '/dashboard'
              }}
              onBack={() => {
                setPendingEmail('')
                setDevCode(undefined)
                setError('')
              }}
            />
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('name')}</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('yourName')} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('email')}</label>
                  <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="you@example.com" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('password')}</label>
                  <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder={t('atLeast8Chars')} required />
                </div>

                {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

                <button type="submit" disabled={loading} className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium">{loading ? t('creatingAccount') : t('createAccount')}</button>
              </form>

              <p className="mt-4 text-sm text-center text-gray-500">{t('loginLinkLead')} <Link href="/dashboard/login" className="text-blue-600 hover:text-blue-700 font-medium">{t('signIn')}</Link></p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
