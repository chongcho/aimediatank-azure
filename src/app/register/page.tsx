'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    name: '',
    ageRange: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [verificationUrl, setVerificationUrl] = useState('')
  
  // Email verification state
  const [emailStatus, setEmailStatus] = useState<{
    checking: boolean
    valid: boolean | null
    available: boolean | null
    message: string
  }>({
    checking: false,
    valid: null,
    available: null,
    message: '',
  })

  // Debounced email check
  const checkEmail = useCallback(async (email: string) => {
    if (!email || email.length < 5) {
      setEmailStatus({ checking: false, valid: null, available: null, message: '' })
      return
    }

    setEmailStatus(prev => ({ ...prev, checking: true }))

    try {
      const res = await fetch('/api/auth/check-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()

      setEmailStatus({
        checking: false,
        valid: data.valid,
        available: data.available,
        message: data.error || data.message || '',
      })
    } catch {
      setEmailStatus({
        checking: false,
        valid: null,
        available: null,
        message: 'Failed to verify email',
      })
    }
  }, [])

  // Debounce email verification
  useEffect(() => {
    const timer = setTimeout(() => {
      if (formData.email) {
        checkEmail(formData.email)
      }
    }, 500) // Wait 500ms after user stops typing

    return () => clearTimeout(timer)
  }, [formData.email, checkEmail])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Check email availability
    if (!emailStatus.valid || !emailStatus.available) {
      setError('Please enter a valid and available email address')
      return
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          username: formData.username,
          password: formData.password,
          name: formData.name,
          ageRange: formData.ageRange,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Registration failed')
      } else {
        // Redirect to login on success
        router.push('/login?registered=true')
      }
    } catch (err) {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  // Success state - show verification instructions
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center">
          <div className="card p-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-2">Check Your Email!</h1>
            <p className="text-gray-400 mb-6">
              We've sent a verification link to <strong className="text-white">{formData.email}</strong>. 
              Please click the link to verify your account.
            </p>
            
            <div className="p-4 bg-tank-gray rounded-xl text-left mb-6">
              <p className="text-sm text-gray-400 mb-2">Didn't receive the email?</p>
              <ul className="text-sm text-gray-500 list-disc list-inside space-y-1">
                <li>Check your spam or junk folder</li>
                <li>Make sure the email address is correct</li>
                <li>Wait a few minutes and check again</li>
              </ul>
            </div>

            {/* Dev mode: show verification link */}
            {verificationUrl && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl text-left mb-6">
                <p className="text-yellow-400 text-sm font-semibold mb-2">
                  🔧 Development Mode
                </p>
                <p className="text-xs text-gray-400 mb-2">Click to verify:</p>
                <a 
                  href={verificationUrl} 
                  className="text-xs text-tank-accent break-all hover:underline"
                >
                  {verificationUrl}
                </a>
              </div>
            )}

            <div className="space-y-3">
              <Link href="/login" className="btn-primary block">
                Go to Login
              </Link>
              <Link href="/resend-verification" className="block text-tank-accent hover:underline text-sm">
                Resend Verification Email
              </Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gradient-to-br from-tank-accent to-emerald-400 rounded-xl flex items-center justify-center">
              <span className="text-tank-black font-bold text-xl">AI</span>
            </div>
            <span className="font-bold text-2xl">MediaTank</span>
          </Link>
          <h1 className="text-3xl font-bold mb-2">Create Account</h1>
          <p className="text-gray-400">Join our AI media community</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Display Name
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Username *
              </label>
              <input
                type="text"
                name="username"
                value={formData.username}
                onChange={handleChange}
                placeholder="johndoe"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Email *
              </label>
              <div className="relative">
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="your@email.com"
                  required
                  className={`pr-10 ${
                    emailStatus.valid === false || emailStatus.available === false
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                      : emailStatus.valid && emailStatus.available
                      ? 'border-green-500 focus:border-green-500 focus:ring-green-500/20'
                      : ''
                  }`}
                />
                {/* Status icon */}
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {emailStatus.checking ? (
                    <svg className="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : emailStatus.valid && emailStatus.available ? (
                    <svg className="h-5 w-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (emailStatus.valid === false || emailStatus.available === false) ? (
                    <svg className="h-5 w-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  ) : null}
                </div>
              </div>
              {/* Status message */}
              {emailStatus.message && (
                <p className={`text-xs mt-1 ${
                  emailStatus.valid && emailStatus.available ? 'text-green-400' : 'text-red-400'
                }`}>
                  {emailStatus.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Password *
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Confirm Password *
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="••••••••"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Age Range *
              </label>
              <select
                name="ageRange"
                value={formData.ageRange}
                onChange={handleChange}
                className="w-full"
                required
              >
                <option value="">Select your age range</option>
                <option value="UNDER_18">Under 18</option>
                <option value="18_PLUS">18 and over</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Required for content filtering
              </p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Creating account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>
        </div>

        <p className="text-center mt-6 text-gray-400">
          Already have an account?{' '}
          <Link href="/login" className="text-tank-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
