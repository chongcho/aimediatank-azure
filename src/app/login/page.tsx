'use client'

import { Suspense, useState, useEffect } from 'react'
import { signIn, getSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { SocialSignIn } from '@/components/SocialSignIn'
import {
  appendAdminFreshStep2Param,
  ADMIN_FORCE_STEP2_STORAGE_KEY,
  isAppAdminRole,
} from '@/lib/adminFreshStep2'

const ERROR_MESSAGES: Record<string, string> = {
  OAuthCallback: 'Social login failed. You can try again or log in with email below.',
  Callback: 'Login failed. Try again or use email to log in.',
  OAuthSignin: 'Social login failed. Try again or use email.',
  OAuthCreateAccount: 'Could not create account with that provider. Try joining with email.',
  OAuthAccountNotLinked: 'Log in with the same account you used originally.',
  CredentialsSignin: 'Invalid email or password. Please try again.',
  EmailSignin: 'Email login failed. Please try again.',
  SessionRequired: 'Please log in to access this page.',
  default: 'Something went wrong. Please try again.',
}

function LoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [showForgotEmail, setShowForgotEmail] = useState(false)
  const [forgotEmailUsername, setForgotEmailUsername] = useState('')
  const [forgotEmailLoading, setForgotEmailLoading] = useState(false)
  const [forgotEmailResult, setForgotEmailResult] = useState<{ maskedEmail?: string; error?: string } | null>(null)

  useEffect(() => {
    const errorCode = searchParams.get('error')
    if (errorCode) {
      setError(ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.default)
      window.history.replaceState({}, '', '/login')
    }
  }, [searchParams])

  const handleForgotEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotEmailResult(null)
    setForgotEmailLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: forgotEmailUsername }),
      })
      const data = await res.json()
      if (res.ok && data.maskedEmail) {
        setForgotEmailResult({ maskedEmail: data.maskedEmail })
      } else {
        setForgotEmailResult({ error: data.error || 'User not found' })
      }
    } catch {
      setForgotEmailResult({ error: 'An error occurred. Please try again.' })
    } finally {
      setForgotEmailLoading(false)
    }
  }

  const closeForgotEmail = () => {
    setShowForgotEmail(false)
    setForgotEmailUsername('')
    setForgotEmailResult(null)
  }

  const callbackUrl = searchParams.get('callbackUrl') || '/'
  const safeCallbackUrl = callbackUrl.startsWith('/') && !callbackUrl.startsWith('//') ? callbackUrl : '/'
  const returningToAdmin =
    safeCallbackUrl === '/admin' || safeCallbackUrl.startsWith('/admin?')

  const showCredentialsForm = returningToAdmin || showEmailForm

  const showDeactivateActivateCta =
    Boolean(error && error.toLowerCase().includes('deactivated') && showCredentialsForm)

  const finishLoginAfterCredentialsOk = async () => {
    let dest = safeCallbackUrl
    if (safeCallbackUrl === '/admin' || safeCallbackUrl.startsWith('/admin?')) {
      dest = appendAdminFreshStep2Param(safeCallbackUrl)
    } else {
      const s = await getSession()
      if (isAppAdminRole(s?.user?.role)) {
        dest = `/login/admin-verify?next=${encodeURIComponent(safeCallbackUrl)}`
      }
    }
    try {
      if (dest.startsWith('/admin')) {
        sessionStorage.setItem(ADMIN_FORCE_STEP2_STORAGE_KEY, '1')
      }
    } catch {
      /* private mode */
    }
    window.location.replace(dest)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError(ERROR_MESSAGES[result.error] ?? result.error)
        setLoading(false)
      } else if (result?.ok) {
        await finishLoginAfterCredentialsOk()
        return
      }
    } catch (err) {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  const handleActivate = async () => {
    if (!email.trim() || !password) {
      setError(
        'This account has been deactivated. Enter the email and password for this account, then tap Activate.',
      )
      return
    }
    setLoading(true)
    try {
      const act = await fetch('/api/user/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await act.json().catch(() => ({}))
      if (!act.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Could not activate account.')
        setLoading(false)
        return
      }
      const result = await signIn('credentials', {
        email: email.trim(),
        password,
        redirect: false,
      })
      if (result?.error) {
        setError(ERROR_MESSAGES[result.error] ?? result.error)
        setLoading(false)
      } else if (result?.ok) {
        await finishLoginAfterCredentialsOk()
      }
    } catch {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-0 m-0 pb-[500px]">
      <div className="w-full max-w-md relative">
        <div className="text-center mb-8 pt-[30px]">
          <Link href="/" className="inline-block mb-6">
            <span className="font-bold text-3xl text-white">
              <span className="text-tank-accent">A</span>i
              <span className="text-red-500">M</span>edia
              <span className="text-sky-400">T</span>ank
            </span>
          </Link>
          {returningToAdmin && (
            <p className="text-xs font-semibold uppercase tracking-wide text-tank-accent mb-2">
              Step 1 of 2 · Account login
            </p>
          )}
          <div className="flex items-center justify-center relative">
            <h1 className="text-3xl font-bold mb-2">Welcome Back</h1>
            <button
              type="button"
              onClick={() => { window.location.href = '/' }}
              className="absolute right-0 w-8 h-8 flex items-center justify-center rounded-full bg-gray-600/80 hover:bg-gray-500/80 text-white transition-colors"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-gray-400">Log in to your account</p>
          {returningToAdmin && (
            <p className="text-sm text-gray-300 mt-3 max-w-md mx-auto">
              Use your email and password here first. Step 2 (after login) is Admin Panel verification: a server-configured admin passphrase plus email or phone code.
            </p>
          )}
        </div>

        <div className="card">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              <p className={showDeactivateActivateCta ? 'font-bold' : undefined}>{error}</p>
              {showDeactivateActivateCta && (
                <button
                  type="button"
                  onClick={() => void handleActivate()}
                  disabled={loading}
                  className="mt-4 w-full btn-primary flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <span className="spinner" />
                      Activating...
                    </>
                  ) : (
                    'Activate'
                  )}
                </button>
              )}
            </div>
          )}

          {showForgotEmail ? (
            <form onSubmit={handleForgotEmail} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Enter your Nickname (username)
                </label>
                <input
                  type="text"
                  value={forgotEmailUsername}
                  onChange={(e) => setForgotEmailUsername(e.target.value)}
                  placeholder="Your username"
                  required
                  autoFocus
                />
              </div>

              {forgotEmailResult?.error && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  {forgotEmailResult.error}
                </div>
              )}

              {forgotEmailResult?.maskedEmail && (
                <div className="p-4 bg-emerald-900/40 border border-emerald-700/50 rounded-xl text-center">
                  <p className="text-sm font-semibold text-white mb-2">Your login email:</p>
                  <p className="text-lg font-bold text-emerald-400 bg-emerald-900/50 px-4 py-2 rounded-lg tracking-wide">
                    {forgotEmailResult.maskedEmail}
                  </p>
                  <p className="text-xs text-emerald-300/70 mt-2">Use this email to log in</p>
                </div>
              )}

              <button
                type="submit"
                disabled={forgotEmailLoading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {forgotEmailLoading ? (
                  <>
                    <span className="spinner" />
                    Searching...
                  </>
                ) : (
                  'Find My Email'
                )}
              </button>

              <button
                type="button"
                onClick={closeForgotEmail}
                className="w-full text-center text-sm text-gray-400 hover:text-gray-200 transition-colors py-2"
              >
                ← Back to Log in
              </button>
            </form>
          ) : !showCredentialsForm ? (
            <>
              <SocialSignIn mode="signin" callbackUrl={safeCallbackUrl} hideDividerAbove />

              <div className="relative mt-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-tank-light" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-tank-gray px-3 text-gray-400">Or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowEmailForm(true)}
                className="mt-6 w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors text-gray-200"
              >
                Log in with Email
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {!returningToAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setError('')
                    setShowEmailForm(false)
                  }}
                  className="text-sm text-gray-400 hover:text-gray-200 transition-colors -mb-2"
                >
                  ← Back
                </button>
              )}

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Email
                  </label>
                  <button
                    type="button"
                    onClick={() => { setError(''); setShowForgotEmail(true) }}
                    className="text-sm text-blue-400 hover:underline"
                  >
                    Forgot email?
                  </button>
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  required
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-300">
                    Password
                  </label>
                  <Link href="/forgot-password" className="text-sm text-tank-accent hover:underline">
                    Forgot password?
                  </Link>
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary w-full flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="spinner" />
                    Logging in...
                  </>
                ) : (
                  'Log in'
                )}
              </button>
            </form>
          )}

          {returningToAdmin && showCredentialsForm && !showForgotEmail && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-tank-light" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-tank-gray px-3 text-gray-400">Or continue with</span>
                </div>
              </div>
              <SocialSignIn
                mode="signin"
                callbackUrl={appendAdminFreshStep2Param(safeCallbackUrl)}
                hideDividerAbove
              />
              <p className="text-xs text-gray-500 text-center mt-3">
                Social login only if your admin account uses that provider. Email/password above is recommended for admin access.
              </p>
            </>
          )}

          <p className="mt-6 text-center text-sm text-gray-400">
            By logging in, you agree to the AI Media Tank (AiM){' '}
            <Link href="/terms?from=login" className="text-tank-accent hover:underline font-medium">
              Terms of Service
            </Link>
            {' '}and{' '}
            <Link href="/privacy?from=login" className="text-tank-accent hover:underline font-medium">
              Privacy Policy
            </Link>
            {' '}and acknowledge that you have read and accepted all applicable rules and regulations.
          </p>
        </div>

        <p className="text-center mt-6 text-gray-400">
          Don't have an account?{' '}
          <Link href="/register" className="text-tank-accent hover:underline">
            Join
          </Link>
        </p>
      </div>
    </div>
  )
}

function LoginFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-0 m-0 pb-[500px]">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-6">
            <span className="font-bold text-3xl text-white">
              <span className="text-tank-accent">A</span>i
              <span className="text-red-500">M</span>edia
              <span className="text-sky-400">T</span>ank
            </span>
          </Link>
          <h1 className="text-3xl font-bold mb-2">Welcome Back</h1>
          <p className="text-gray-400">Log in to your account</p>
        </div>
        <div className="card flex items-center justify-center py-12">
          <span className="spinner w-8 h-8" />
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <div data-initial-content className="contents">
      <Suspense fallback={<LoginFallback />}>
        <LoginContent />
      </Suspense>
    </div>
  )
}
