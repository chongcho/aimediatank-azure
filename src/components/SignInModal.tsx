'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { SocialSignIn } from '@/components/SocialSignIn'

interface SignInModalProps {
  isOpen: boolean
  onClose: () => void
}

function SignInModalContent({ onClose }: { onClose: () => void }) {
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  // Forgot email states
  const [showForgotEmail, setShowForgotEmail] = useState(false)
  const [forgotEmailUsername, setForgotEmailUsername] = useState('')
  const [forgotEmailLoading, setForgotEmailLoading] = useState(false)
  const [forgotEmailResult, setForgotEmailResult] = useState<{ maskedEmail?: string; error?: string } | null>(null)

  // Block body scroll when modal is open (iOS-safe method)
  useEffect(() => {
    const scrollY = window.scrollY
    document.body.style.overflow = 'hidden'
    
    return () => {
      document.body.style.overflow = ''
      window.scrollTo(0, scrollY)
    }
  }, [])

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
        setError('Invalid email or password')
      } else {
        onClose()
        window.location.reload()
      }
    } catch (err) {
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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
    } catch (err) {
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

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.9)',
        padding: '16px',
        overflowY: 'auto',
      }}
      onClick={onClose}
    >
      <div 
        style={{
          position: 'relative',
          background: '#1a1a1a',
          borderRadius: '16px',
          padding: '32px',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.6)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            width: '32px',
            height: '32px',
            background: '#333',
            border: 'none',
            borderRadius: '50%',
            color: '#999',
            cursor: 'pointer',
            fontSize: '20px',
            lineHeight: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ×
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ marginBottom: '16px' }}>
            <span style={{ fontWeight: 'bold', fontSize: '28px', color: 'white' }}>
              <span style={{ color: '#10b981' }}>A</span>i
              <span style={{ color: '#ef4444' }}>M</span>edia
              <span style={{ color: '#3b82f6' }}>T</span>ank
            </span>
          </div>
          <h2 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0' }}>
            Welcome Back
          </h2>
          <p style={{ color: '#888', fontSize: '14px', margin: 0 }}>
            Sign in to your account
          </p>
        </div>

        {/* Forgot Email Form */}
        {showForgotEmail ? (
          <div>
            <form onSubmit={handleForgotEmail}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#ccc', fontSize: '14px', marginBottom: '8px' }}>
                  Enter your User ID (username)
                </label>
                <input
                  type="text"
                  value={forgotEmailUsername}
                  onChange={(e) => setForgotEmailUsername(e.target.value)}
                  placeholder="Your username"
                  required
                  autoFocus
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    borderRadius: '8px',
                    border: '1px solid #333',
                    background: '#2a2a2a',
                    color: 'white',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              {forgotEmailResult?.error && (
                <div style={{
                  background: '#dc2626',
                  color: 'white',
                  padding: '10px 16px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  fontSize: '14px',
                }}>
                  {forgotEmailResult.error}
                </div>
              )}

              {forgotEmailResult?.maskedEmail && (
                <div style={{
                  background: '#065f46',
                  color: 'white',
                  padding: '16px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  fontSize: '14px',
                  textAlign: 'center',
                }}>
                  <div style={{ marginBottom: '8px', fontWeight: '600' }}>📧 Your sign-in email:</div>
                  <div style={{ 
                    fontSize: '18px', 
                    fontWeight: 'bold',
                    background: '#047857',
                    padding: '10px 16px',
                    borderRadius: '6px',
                    letterSpacing: '1px',
                  }}>
                    {forgotEmailResult.maskedEmail}
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#a7f3d0' }}>
                    Use this email to sign in
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={forgotEmailLoading}
                style={{
                  width: '100%',
                  padding: '14px',
                  borderRadius: '24px',
                  border: 'none',
                  background: forgotEmailLoading ? '#666' : '#3b82f6',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '16px',
                  cursor: forgotEmailLoading ? 'not-allowed' : 'pointer',
                  marginBottom: '12px',
                }}
              >
                {forgotEmailLoading ? 'Searching...' : 'Find My Email'}
              </button>

              <button
                type="button"
                onClick={closeForgotEmail}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '24px',
                  border: '1px solid #444',
                  background: 'transparent',
                  color: '#999',
                  fontWeight: '500',
                  fontSize: '14px',
                  cursor: 'pointer',
                  marginBottom: '20px',
                }}
              >
                ← Back to Sign In
              </button>
            </form>
          </div>
        ) : !showEmailForm ? (
          /* Social first, then Sign in with Email */
          <>
            {error && (
              <div style={{
                background: '#dc2626',
                color: 'white',
                padding: '10px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '14px',
              }}>
                {error}
              </div>
            )}
            <div style={{ marginBottom: '16px' }}>
              <SocialSignIn
                mode="signin"
                callbackUrl={typeof window !== 'undefined' ? window.location.href : '/'}
                hideDividerAbove
              />
            </div>
            <div style={{
              position: 'relative',
              margin: '20px 0',
              display: 'flex',
              alignItems: 'center',
            }}>
              <div style={{ flex: 1, height: 1, background: '#333' }} />
              <span style={{ padding: '0 12px', color: '#888', fontSize: '14px' }}>Or</span>
              <div style={{ flex: 1, height: 1, background: '#333' }} />
            </div>
            <button
              type="button"
              onClick={() => setShowEmailForm(true)}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: '1px solid #333',
                background: '#2a2a2a',
                color: '#e5e5e5',
                fontWeight: '500',
                fontSize: '16px',
                cursor: 'pointer',
              }}
            >
              Sign in with Email
            </button>
          </>
        ) : (
          /* Email / password form */
          <form onSubmit={handleSubmit}>
            <button
              type="button"
              onClick={() => setShowEmailForm(false)}
              style={{
                background: 'none',
                border: 'none',
                color: '#888',
                fontSize: '14px',
                cursor: 'pointer',
                padding: 0,
                marginBottom: '16px',
              }}
            >
              ← Back
            </button>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ color: '#ccc', fontSize: '14px' }}>
                  Email
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotEmail(true)}
                  style={{ 
                    background: 'none', 
                    border: 'none', 
                    color: '#3b82f6', 
                    fontSize: '13px', 
                    cursor: 'pointer',
                    padding: 0,
                  }}
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
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid #333',
                  background: '#2a2a2a',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label style={{ color: '#ccc', fontSize: '14px' }}>
                  Password
                </label>
                <Link 
                  href="/forgot-password" 
                  onClick={onClose}
                  style={{ color: '#10b981', fontSize: '13px', textDecoration: 'none' }}
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: '1px solid #333',
                  background: '#2a2a2a',
                  color: 'white',
                  fontSize: '14px',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div style={{
                background: '#dc2626',
                color: 'white',
                padding: '10px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '14px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '24px',
                border: 'none',
                background: loading ? '#666' : '#10b981',
                color: loading ? '#999' : '#000',
                fontWeight: '600',
                fontSize: '16px',
                cursor: loading ? 'not-allowed' : 'pointer',
                marginBottom: '20px',
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
        )}

        {/* Legal disclaimer */}
        <p style={{ textAlign: 'center', color: '#888', fontSize: '12px', margin: '20px 0 0 0', lineHeight: 1.5 }}>
          I have read and agree to the{' '}
          <Link href="/policy#terms" onClick={onClose} style={{ color: '#10b981', textDecoration: 'underline' }}>
            Terms of Service
          </Link>
          {' '}and{' '}
          <Link href="/policy#privacy" onClick={onClose} style={{ color: '#10b981', textDecoration: 'underline' }}>
            Privacy Policy
          </Link>
          . I understand and accept the platform rules and regulations.
        </p>

        {/* Footer */}
        <p style={{ textAlign: 'center', color: '#888', fontSize: '14px', margin: '16px 0 0 0' }}>
          Don&apos;t have an account?{' '}
          <Link 
            href="/register" 
            onClick={onClose}
            style={{ color: '#10b981', textDecoration: 'underline' }}
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

export default function SignInModal({ isOpen, onClose }: SignInModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  if (!isOpen || !mounted) {
    return null
  }

  return createPortal(
    <SignInModalContent onClose={onClose} />,
    document.body
  )
}


