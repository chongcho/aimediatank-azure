'use client'

// Registration page with email verification
import { useState, useEffect, useCallback, useRef } from 'react'
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
  
  // Avatar state (preview only - actual upload after login in profile edit)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  
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
  
  // Email verification code state
  const [verificationState, setVerificationState] = useState<{
    codeSent: boolean
    codeVerified: boolean
    sending: boolean
    verifying: boolean
    code: string
    error: string
  }>({
    codeSent: false,
    codeVerified: false,
    sending: false,
    verifying: false,
    code: '',
    error: '',
  })
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [generatedCode, setGeneratedCode] = useState('')

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
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
    
    // Reset verification if email changes
    if (name === 'email') {
      setVerificationState(prev => ({
        ...prev,
        codeSent: false,
        codeVerified: false,
        code: '',
        error: '',
      }))
    }
  }

  // Avatar handlers (preview only - upload handled in profile edit after login)
  const handleAvatarClick = () => {
    fileInputRef.current?.click()
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Show preview
    const previewUrl = URL.createObjectURL(file)
    setAvatarPreview(previewUrl)
  }

  // Send verification code
  const sendVerificationCode = async () => {
    if (!emailStatus.valid || !emailStatus.available) {
      return
    }

    setVerificationState(prev => ({ ...prev, sending: true, error: '' }))

    try {
      const res = await fetch('/api/auth/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      })
      const data = await res.json()

      if (res.ok) {
        setVerificationState(prev => ({
          ...prev,
          codeSent: true,
          sending: false,
        }))
        setShowVerifyModal(true)
        if (data.code) {
          // Dev mode: show code
          setGeneratedCode(data.code)
        }
      } else {
        setVerificationState(prev => ({
          ...prev,
          sending: false,
          error: data.error || 'Failed to send code',
        }))
      }
    } catch {
      setVerificationState(prev => ({
        ...prev,
        sending: false,
        error: 'Failed to send verification code',
      }))
    }
  }

  // Verify the code
  const verifyCode = async () => {
    setVerificationState(prev => ({ ...prev, verifying: true, error: '' }))

    try {
      const res = await fetch('/api/auth/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: formData.email,
          code: verificationState.code,
        }),
      })
      const data = await res.json()

      if (res.ok && data.verified) {
        setVerificationState(prev => ({
          ...prev,
          codeVerified: true,
          verifying: false,
        }))
        setShowVerifyModal(false)
      } else {
        setVerificationState(prev => ({
          ...prev,
          verifying: false,
          error: data.error || 'Invalid verification code',
        }))
      }
    } catch {
      setVerificationState(prev => ({
        ...prev,
        verifying: false,
        error: 'Failed to verify code',
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Check email verification
    if (!verificationState.codeVerified) {
      setError('Please verify your email address first')
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
        // Note: Avatar can be set after login in profile edit
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

            {/* Avatar and Nickname Section */}
            <div className="flex items-center gap-6 pb-2">
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-tank-light">
                    {avatarPreview ? (
                      <img 
                        src={avatarPreview} 
                        alt="Avatar" 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-tank-accent to-purple-500 flex items-center justify-center text-3xl font-bold">
                        {formData.name?.[0]?.toUpperCase() || formData.username?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
                
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-tank-gray hover:bg-tank-light border border-tank-light rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Edit Avatar
                </button>
              </div>
              
              {/* Nickname input */}
              <div className="flex-1 space-y-2">
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Your Nickname"
                  className="text-xl font-bold bg-tank-gray border border-tank-light rounded-xl px-4 py-3 w-full"
                />
                <p className="text-sm text-gray-400">Nickname</p>
              </div>
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
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="your@email.com"
                    required
                    disabled={verificationState.codeVerified}
                    className={`w-full ${
                      verificationState.codeVerified
                        ? 'border-green-500 bg-green-500/10'
                        : emailStatus.valid === false || emailStatus.available === false
                        ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                        : emailStatus.valid && emailStatus.available
                        ? 'border-tank-accent focus:border-tank-accent focus:ring-tank-accent/20'
                        : ''
                    }`}
                  />
                </div>
                {/* Verify Email Button - Always visible */}
                {verificationState.codeVerified ? (
                  <div className="flex items-center px-4 py-2 bg-green-500/20 text-green-400 rounded-xl text-sm font-medium whitespace-nowrap border border-green-500/50">
                    <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Email Verified
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={sendVerificationCode}
                    disabled={!formData.email || formData.email.length < 5 || verificationState.sending}
                    className="flex-shrink-0 px-4 py-2.5 bg-tank-accent text-tank-black rounded-xl text-sm font-semibold hover:bg-tank-accent/90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
                  >
                    {verificationState.sending ? (
                      <span className="flex items-center">
                        <svg className="animate-spin h-4 w-4 mr-1.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Sending...
                      </span>
                    ) : verificationState.codeSent ? (
                      'Resend Code'
                    ) : (
                      'Verify Email'
                    )}
                  </button>
                )}
              </div>
              {/* Status message */}
              {emailStatus.message && !verificationState.codeVerified && (
                <p className={`text-xs mt-1 ${
                  emailStatus.valid && emailStatus.available ? 'text-tank-accent' : 'text-red-400'
                }`}>
                  {emailStatus.message}
                </p>
              )}
              {verificationState.error && (
                <p className="text-xs mt-1 text-red-400">{verificationState.error}</p>
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

      {/* Verification Code Modal */}
      {showVerifyModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-tank-dark border border-tank-gray rounded-2xl p-6 w-full max-w-md">
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-tank-accent/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-tank-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Verify Your Email</h3>
              <p className="text-gray-400 text-sm">
                We've sent a 6-digit verification code to<br />
                <strong className="text-white">{formData.email}</strong>
              </p>
            </div>

            {/* Dev mode: show code */}
            {generatedCode && (
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                <p className="text-yellow-400 text-xs font-semibold mb-1">🔧 Dev Mode - Your code:</p>
                <p className="text-2xl font-mono font-bold text-center text-yellow-400">{generatedCode}</p>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Enter Verification Code
              </label>
              <input
                type="text"
                value={verificationState.code}
                onChange={(e) => setVerificationState(prev => ({ 
                  ...prev, 
                  code: e.target.value.replace(/\D/g, '').slice(0, 6),
                  error: '',
                }))}
                placeholder="000000"
                maxLength={6}
                className="text-center text-2xl font-mono tracking-widest"
              />
            </div>

            {verificationState.error && (
              <p className="text-red-400 text-sm text-center mb-4">{verificationState.error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowVerifyModal(false)}
                className="flex-1 px-4 py-3 bg-tank-gray text-white rounded-xl font-medium hover:bg-tank-gray/80 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={verifyCode}
                disabled={verificationState.code.length !== 6 || verificationState.verifying}
                className="flex-1 px-4 py-3 bg-tank-accent text-tank-black rounded-xl font-medium hover:bg-tank-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {verificationState.verifying ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Verifying...
                  </span>
                ) : (
                  'Verify'
                )}
              </button>
            </div>

            <p className="text-center text-gray-500 text-xs mt-4">
              Didn't receive the code?{' '}
              <button
                type="button"
                onClick={sendVerificationCode}
                disabled={verificationState.sending}
                className="text-tank-accent hover:underline"
              >
                Resend
              </button>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
