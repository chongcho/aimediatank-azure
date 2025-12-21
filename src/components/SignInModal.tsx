'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'

interface SignInModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SignInModal({ isOpen, onClose }: SignInModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

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

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.7)',
      }}
      onClick={onClose}
    >
      <div 
        style={{
          background: '#1a1a1a',
          borderRadius: '16px',
          padding: '32px',
          width: '100%',
          maxWidth: '400px',
          margin: '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
            <div style={{
              background: '#10b981',
              borderRadius: '8px',
              padding: '8px 12px',
              color: 'white',
              fontWeight: 'bold',
              fontSize: '14px',
            }}>
              AI
            </div>
            <span style={{ color: 'white', fontWeight: 'bold', fontSize: '20px' }}>MediaTank</span>
          </div>
          <h2 style={{ color: 'white', fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0' }}>
            Welcome Back
          </h2>
          <p style={{ color: '#888', fontSize: '14px', margin: 0 }}>
            Sign in to your account
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#ccc', fontSize: '14px', marginBottom: '8px' }}>
              Email
            </label>
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
            <label style={{ display: 'block', color: '#ccc', fontSize: '14px', marginBottom: '8px' }}>
              Password
            </label>
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

        {/* Footer */}
        <p style={{ textAlign: 'center', color: '#888', fontSize: '14px', margin: 0 }}>
          Don&apos;t have an account?{' '}
          <Link 
            href="/register" 
            onClick={onClose}
            style={{ color: '#10b981', textDecoration: 'underline' }}
          >
            Sign up
          </Link>
        </p>

        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '24px',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
    </div>
  )
}

