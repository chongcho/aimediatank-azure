'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

export default function ResendVerificationPage() {
  const { data: session } = useSession()
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [devUrl, setDevUrl] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus('loading')
    setMessage('')
    setDevUrl('')

    try {
      const res = await fetch('/api/auth/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: session?.user?.email || email }),
      })

      const data = await res.json()

      if (res.ok) {
        setStatus('success')
        setMessage(data.message)
        // Show dev URL in development
        if (data.devUrl) {
          setDevUrl(data.devUrl)
        }
      } else {
        setStatus('error')
        setMessage(data.error || 'Failed to send verification email')
      }
    } catch (error) {
      setStatus('error')
      setMessage('Something went wrong')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">Resend Verification</h1>
          <p className="text-gray-400">
            Enter your email to receive a new verification link
          </p>
        </div>

        <div className="card">
          {status === 'success' ? (
            <div className="text-center p-4">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-green-400 mb-2">Email Sent!</h2>
              <p className="text-gray-400 mb-4">{message}</p>
              <p className="text-sm text-gray-500 mb-4">
                Check your inbox and spam folder for the verification link.
              </p>

              {/* Dev mode: show verification link */}
              {devUrl && (
                <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-left">
                  <p className="text-yellow-400 text-sm font-semibold mb-2">
                    🔧 Development Mode
                  </p>
                  <p className="text-xs text-gray-400 mb-2">Verification link:</p>
                  <a 
                    href={devUrl} 
                    className="text-xs text-tank-accent break-all hover:underline"
                  >
                    {devUrl}
                  </a>
                </div>
              )}

              <Link href="/login" className="btn-primary inline-block mt-4">
                Back to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {status === 'error' && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  {message}
                </div>
              )}

              {session?.user?.email ? (
                <div className="p-4 bg-tank-gray rounded-xl">
                  <p className="text-sm text-gray-400 mb-1">Sending to:</p>
                  <p className="font-medium">{session.user.email}</p>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full"
                    required
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={status === 'loading'}
                className="btn-primary w-full"
              >
                {status === 'loading' ? 'Sending...' : 'Send Verification Email'}
              </button>

              <p className="text-center text-sm text-gray-400">
                Remember your password?{' '}
                <Link href="/login" className="text-tank-accent hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}


