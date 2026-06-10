'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchCurrentUser, type DashboardUser } from '@/lib/dashboard/auth'

export default function AccountPage() {
  const router = useRouter()
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
        setError(body.error || 'Failed to update profile')
        return
      }
      setUser(body.user)
      setMessage('Profile updated successfully')
    } finally {
      setProfileSubmitting(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setMessage('')
    setError('')

    if (passwordForm.newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('Password confirmation does not match')
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
        setError(body.error || 'Failed to change password')
        return
      }
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
      setMessage('Password updated successfully')
    } finally {
      setPasswordSubmitting(false)
    }
  }

  if (loading || !user) {
    return <div className="flex items-center justify-center h-64"><div className="text-gray-500">Loading account...</div></div>
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Account</h2>
        <p className="text-sm text-gray-500 mt-1">Manage your profile and password</p>
      </div>

      {message && <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">{message}</div>}
      {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

      <div className="rounded-lg shadow-sm border border-gray-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Balance</h3>
        <p className="text-sm text-gray-500 mb-4">Your available prepaid balance for billed image generation</p>
        <div className="text-3xl font-bold text-gray-900">${(user.balance ?? 0).toFixed(4)}</div>
      </div>

      <div className="rounded-lg shadow-sm border border-gray-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile</h3>
        <form onSubmit={saveProfile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input value={user.email} disabled className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-gray-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input value={profileForm.name} onChange={(e) => setProfileForm({ name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Your name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <input value={user.role} disabled className="w-full px-3 py-2 border border-gray-200 bg-gray-50 rounded-md text-gray-500" />
          </div>
          <button type="submit" disabled={profileSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {profileSubmitting ? 'Saving...' : 'Save Profile'}
          </button>
        </form>
      </div>

      <div className="rounded-lg shadow-sm border border-gray-200 bg-white p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
        <form onSubmit={changePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input type="password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <button type="submit" disabled={passwordSubmitting} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {passwordSubmitting ? 'Updating...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
