'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'

function VerifyEmailContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get('token')
  
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (token) {
      verifyEmail()
    } else {
      setStatus('error')
      setMessage('No verification token provided')
    }
  }, [token])

  const verifyEmail = async () => {
    try {
      const res = await fetch(`/api/auth/verify?token=${token}`)
      const data = await res.json()

      if (res.ok) {
        setStatus('success')
        setMessage(data.message)
        setTimeout(() => {
          router.push('/login')
        }, 3000)
      } else {
        setStatus('error')
        setMessage(data.error || 'Verification failed')
      }
    } catch (error) {
      setStatus('error')
      setMessage('Something went wrong')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        {status === 'loading' && (
          <div className="card p-8">
            <div className="spinner mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Verifying Email</h1>
            <p className="text-gray-400">Please wait while we verify your email address...</p>
          </div>
        )}

        {status === 'success' && (
          <div className="card p-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2 text-green-400">Email Verified!</h1>
            <p className="text-gray-400 mb-6">{message}</p>
            <p className="text-sm text-gray-500 mb-4">Redirecting to login...</p>
            <Link href="/login" className="btn-primary inline-block">
              Go to Login
            </Link>
          </div>
        )}

        {status === 'error' && (
          <div className="card p-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2 text-red-400">Verification Failed</h1>
            <p className="text-gray-400 mb-6">{message}</p>
            <div className="space-y-3">
              <Link href="/login" className="btn-primary block">
                Go to Login
              </Link>
              <Link href="/resend-verification" className="block text-tank-accent hover:underline">
                Resend Verification Email
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="spinner" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
