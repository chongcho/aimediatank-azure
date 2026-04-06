'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

function isAppAdminRole(role: string | undefined | null): boolean {
  if (role == null || typeof role !== 'string') return false
  return role.trim().toUpperCase() === 'ADMIN'
}

function sessionRoleIsLoaded(role: string | undefined | null): boolean {
  return typeof role === 'string' && role.length > 0
}

/** Same chrome as Step 2 card so session hydration does not flash a full-screen spinner. */
function AdminReauthPlaceholder({ message }: { message?: string }) {
  return (
    <div data-initial-content className="min-h-screen flex items-center justify-center px-4">
      <div
        className="w-full max-w-md rounded-2xl bg-tank-gray border border-tank-light p-8"
        aria-busy={message ? undefined : true}
        aria-label={message ?? 'Loading admin verification'}
      >
        {message ? (
          <p className="text-gray-400 text-sm text-center">{message}</p>
        ) : (
          <div className="animate-pulse space-y-4">
            <div className="h-3 w-20 bg-tank-light rounded" />
            <div className="h-8 w-56 bg-tank-light rounded" />
            <div className="h-4 w-full bg-tank-light/80 rounded" />
            <div className="h-4 w-full bg-tank-light/80 rounded" />
            <div className="h-4 w-3/4 bg-tank-light/80 rounded" />
            <div className="h-11 w-full bg-tank-light rounded mt-6" />
            <div className="h-11 w-full bg-tank-light rounded" />
            <div className="h-12 w-full bg-tank-accent/20 rounded" />
          </div>
        )}
      </div>
    </div>
  )
}

type AdminReauthGateProps = {
  onVerified: () => void
  /** Server already verified session + admin role — skip useSession loading placeholder (fixes flash). */
  bootstrappedFromServer?: boolean
  initialAdminUsername?: string
  initialAdminPanelPasswordConfigured?: boolean
  initialDedicatedPasswordRequired?: boolean
}

/**
 * Step 2: admin passphrase + email/phone code. Used on /admin/reauth (outside dashboard layout).
 */
export default function AdminReauthGate({
  onVerified,
  bootstrappedFromServer = false,
  initialAdminUsername,
  initialAdminPanelPasswordConfigured = false,
  initialDedicatedPasswordRequired = false,
}: AdminReauthGateProps) {
  const { data: session, status } = useSession()
  const [reauthPassword, setReauthPassword] = useState('')
  const [reauthChannel, setReauthChannel] = useState<'email' | 'phone'>('email')
  const [reauthCode, setReauthCode] = useState('')
  const [reauthSendLoading, setReauthSendLoading] = useState(false)
  const [reauthVerifyLoading, setReauthVerifyLoading] = useState(false)
  const [reauthError, setReauthError] = useState('')
  const [adminPanelPasswordConfigured, setAdminPanelPasswordConfigured] = useState(
    () => (bootstrappedFromServer ? initialAdminPanelPasswordConfigured : false)
  )
  const [dedicatedPasswordRequired, setDedicatedPasswordRequired] = useState(
    () => (bootstrappedFromServer ? initialDedicatedPasswordRequired : false)
  )
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (bootstrappedFromServer) return
    if (status !== 'authenticated' || !session?.user || !isAppAdminRole(session.user.role)) return
    fetch('/api/admin/verify-access', { credentials: 'include', cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return
        setAdminPanelPasswordConfigured(!!data.adminPanelPasswordConfigured)
        setDedicatedPasswordRequired(!!data.dedicatedPasswordRequired)
      })
      .catch(() => {})
  }, [bootstrappedFromServer, status, session?.user?.role])

  useEffect(() => {
    if (!bootstrappedFromServer) return
    if (status === 'unauthenticated') {
      window.location.replace(`/login?callbackUrl=${encodeURIComponent('/admin')}`)
    }
  }, [bootstrappedFromServer, status])

  const handleSendCode = async () => {
    setReauthError('')
    setReauthSendLoading(true)
    try {
      const res = await fetch('/api/admin/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ channel: reauthChannel }),
      })
      const data = await res.json()
      if (!res.ok) {
        setReauthError(data.error || 'Failed to send code')
        return
      }
      setReauthCode('')
      setToast({ message: data.message || 'Code sent', type: 'success' })
    } catch {
      setReauthError('Failed to send code')
    } finally {
      setReauthSendLoading(false)
    }
  }

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    setReauthError('')
    setReauthVerifyLoading(true)
    try {
      const res = await fetch('/api/admin/verify-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: reauthPassword, channel: reauthChannel, code: reauthCode }),
      })
      const data = await res.json()
      if (!res.ok) {
        setReauthError(data.error || 'Verification failed')
        return
      }
      setReauthPassword('')
      setReauthCode('')
      setToast({ message: 'Access granted', type: 'success' })
      onVerified()
    } catch {
      setReauthError('Verification failed')
    } finally {
      setReauthVerifyLoading(false)
    }
  }

  if (!bootstrappedFromServer) {
    if (status === 'loading') {
      return <AdminReauthPlaceholder />
    }

    if (status === 'unauthenticated') {
      return <AdminReauthPlaceholder message="Redirecting to sign in…" />
    }

    if (!session?.user) {
      return <AdminReauthPlaceholder />
    }

    if (!sessionRoleIsLoaded(session.user.role)) {
      return <AdminReauthPlaceholder />
    }

    if (!isAppAdminRole(session.user.role)) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <p className="text-gray-400 text-center">You do not have admin access.</p>
        </div>
      )
    }
  } else {
    if (status === 'unauthenticated') {
      return <AdminReauthPlaceholder message="Redirecting to sign in…" />
    }
    if (
      status === 'authenticated' &&
      session?.user &&
      sessionRoleIsLoaded(session.user.role) &&
      !isAppAdminRole(session.user.role)
    ) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <p className="text-gray-400 text-center">You do not have admin access.</p>
        </div>
      )
    }
  }

  const adminUsername =
    session?.user?.username ??
    session?.user?.name ??
    initialAdminUsername ??
    'your account'

  return (
    <div data-initial-content className="min-h-screen flex items-center justify-center px-4">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[99999] px-6 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
      <div className="w-full max-w-md rounded-2xl bg-tank-gray border border-tank-light p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-tank-accent mb-2">Step 2 of 2</p>
        <h1 className="text-2xl font-bold text-white mb-1">Admin Panel access</h1>
        <p className="text-gray-300 text-sm mb-1">
          Signed in as <span className="font-medium text-white">{adminUsername}</span>. App sign-in is complete; verify
          below to open the panel.
        </p>
        <p className="text-gray-400 text-sm mb-6">
          {adminPanelPasswordConfigured
            ? 'Enter the admin panel password (configured on the server—different from your account login) and complete two-step verification.'
            : 'Re-enter your account password and complete two-step verification to continue.'}
        </p>
        {dedicatedPasswordRequired && !adminPanelPasswordConfigured && (
          <div className="mb-4 p-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm">
            This environment requires a dedicated admin passphrase on the server. Set{' '}
            <code className="text-xs bg-tank-black/50 px-1 rounded">ADMIN_PANEL_ACCESS_PASSWORD_HASH</code> or disable
            the requirement with{' '}
            <code className="text-xs bg-tank-black/50 px-1 rounded">ADMIN_REQUIRE_DEDICATED_PANEL_PASSWORD=false</code>.
          </div>
        )}
        {!dedicatedPasswordRequired && !adminPanelPasswordConfigured && (
          <div className="mb-4 p-3 rounded-xl border border-amber-500/35 bg-amber-500/10 text-amber-100 text-sm">
            <strong className="font-semibold text-amber-50">Stronger admin security:</strong> set{' '}
            <code className="text-xs bg-tank-black/50 px-1 rounded">ADMIN_PANEL_ACCESS_PASSWORD_HASH</code> so this step
            uses a passphrase separate from your login password (recommended for production).
          </div>
        )}
        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              {adminPanelPasswordConfigured ? 'Admin panel password' : 'Password'}
            </label>
            <input
              type="password"
              value={reauthPassword}
              onChange={(e) => {
                setReauthPassword(e.target.value)
                setReauthError('')
              }}
              className="input w-full"
              placeholder={adminPanelPasswordConfigured ? 'Dedicated admin passphrase' : 'Your account password'}
              autoComplete={adminPanelPasswordConfigured ? 'off' : 'current-password'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Verification method</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="channel"
                  checked={reauthChannel === 'email'}
                  onChange={() => {
                    setReauthChannel('email')
                    setReauthError('')
                  }}
                />
                <span className="text-gray-300">Email</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="channel"
                  checked={reauthChannel === 'phone'}
                  onChange={() => {
                    setReauthChannel('phone')
                    setReauthError('')
                  }}
                />
                <span className="text-gray-300">Phone</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={handleSendCode} disabled={reauthSendLoading} className="btn-secondary flex-1">
              {reauthSendLoading ? 'Sending…' : 'Send verification code'}
            </button>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Verification code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={reauthCode}
              onChange={(e) => {
                setReauthCode(e.target.value.replace(/\D/g, ''))
                setReauthError('')
              }}
              className="input w-full font-mono text-lg tracking-widest"
              placeholder="000000"
            />
          </div>
          {reauthError && <p className="text-red-400 text-sm">{reauthError}</p>}
          <button type="submit" disabled={reauthVerifyLoading} className="btn-primary w-full">
            {reauthVerifyLoading ? 'Verifying…' : 'Verify and continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
