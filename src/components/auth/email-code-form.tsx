'use client'

import { useEffect, useState } from 'react'

interface EmailCodeFormProps {
  email: string
  initialDevCode?: string
  onVerified: () => void
  onBack?: () => void
}

export default function EmailCodeForm({ email, initialDevCode, onVerified, onBack }: EmailCodeFormProps) {
  const [code, setCode] = useState('')
  const [devCode, setDevCode] = useState(initialDevCode)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendIn, setResendIn] = useState(60)

  useEffect(() => {
    if (resendIn <= 0) return
    const timer = setInterval(() => setResendIn((seconds) => seconds - 1), 1000)
    return () => clearInterval(timer)
  }, [resendIn])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setVerifying(true)

    try {
      const res = await fetch('/api/v1/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      })

      if (res.ok) {
        onVerified()
      } else {
        const body = await res.json().catch(() => ({}))
        setError(body.error || '验证失败，请检查验证码后重试')
      }
    } catch {
      setError('连接失败，请稍后再试。')
    } finally {
      setVerifying(false)
    }
  }

  async function handleResend() {
    setError('')
    setNotice('')
    setResending(true)

    try {
      const res = await fetch('/api/v1/auth/resend-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = await res.json().catch(() => ({}))

      if (res.ok) {
        setNotice('验证码已重新发送，请查收邮件。')
        if (body.devCode) setDevCode(body.devCode)
        setResendIn(60)
      } else {
        setError(body.error || '发送失败，请稍后再试。')
      }
    } catch {
      setError('连接失败，请稍后再试。')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        验证码已发送至 <span className="font-medium text-gray-900">{email}</span>，请查收邮件并在下方输入 6 位验证码。
      </p>

      {devCode && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          开发模式（未配置 RESEND_API_KEY），本次验证码：{devCode}
        </p>
      )}

      <form onSubmit={handleVerify} className="space-y-4">
        <div>
          <label htmlFor="verification-code" className="block text-sm font-medium text-gray-700 mb-1">邮箱验证码</label>
          <input
            id="verification-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-400 tracking-[0.5em] text-center text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="000000"
            required
            autoFocus
          />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}
        {notice && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{notice}</p>}

        <button
          type="submit"
          disabled={verifying || code.length !== 6}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {verifying ? '验证中...' : '验证并登录'}
        </button>
      </form>

      <div className="flex items-center justify-between text-sm">
        {onBack ? (
          <button type="button" onClick={onBack} className="text-gray-500 hover:text-gray-700">
            返回修改
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={handleResend}
          disabled={resending || resendIn > 0}
          className="text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:text-gray-400"
        >
          {resendIn > 0 ? `${resendIn}s 后可重新发送` : resending ? '发送中...' : '重新发送验证码'}
        </button>
      </div>
    </div>
  )
}
