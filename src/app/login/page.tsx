'use client'

import { Suspense, useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { SocialSignIn } from '@/components/SocialSignIn'

const ERROR_MESSAGES: Record<string, string> = {
  OAuthCallback: 'Social sign-in failed. You can try again or sign in with email below.',
  Callback: 'Sign-in failed. Try again or use email to sign in.',
  OAuthSignin: 'Social sign-in failed. Try again or use email.',
  OAuthCreateAccount: 'Could not create account with that provider. Try email sign-up.',
  OAuthAccountNotLinked: 'Sign in with the same account you used originally.',
  CredentialsSignin: 'Invalid email or password. Please try again.',
  EmailSignin: 'Email sign-in failed. Please try again.',
  SessionRequired: 'Please sign in to access this page.',
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

  useEffect(() => {
    const errorCode = searchParams.get('error')
    if (errorCode) {
      setError(ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.default)
      window.history.replaceState({}, '', '/login')
    }
  }, [searchParams])

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
      } else {
        router.push('/')
        router.refresh()
      }
    } catch (err) {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

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
          <p className="text-gray-400">Sign in to your account</p>
        </div>

        <div className="card">
          {error && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}

          {!showEmailForm ? (
            <>
              <SocialSignIn mode="signin" callbackUrl="/" hideDividerAbove />

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
                Sign in with Email
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
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

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Email
                </label>
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
                    Signing in...
                  </>
                ) : (
                  'Sign In'
                )}
              </button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-gray-400">
            By signing in, you agree to the{' '}
            <Link href="/policy#terms" className="text-tank-accent hover:underline font-medium">
              AiMediaTank Terms of Service
            </Link>
            {' '}and{' '}
            <Link href="/policy#privacy" className="text-tank-accent hover:underline font-medium">
              Privacy Policy
            </Link>
            {' '}and acknowledge that you have read and accepted all applicable rules and regulations.
          </p>
        </div>

        <p className="text-center mt-6 text-gray-400">
          Don't have an account?{' '}
          <Link href="/register" className="text-tank-accent hover:underline">
            Sign up
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
          <p className="text-gray-400">Sign in to your account</p>
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
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  )
}
