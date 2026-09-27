'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { socialProviderSignIn } from '@/lib/socialProviderSignIn'

type Props = {
  providerId: string
  callbackUrl: string
  registerHref?: string
}

function ProviderMark({ label }: { label: string }) {
  if (label === 'Google') {
    return (
      <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    )
  }
  if (label === 'Facebook') {
    return (
      <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
        <path fill="#1877F2" d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    )
  }
  if (label === 'Apple') {
    return (
      <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" aria-hidden>
        <path fill="#111" d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    )
  }
  return (
    <svg className="h-5 w-5 shrink-0" viewBox="0 0 21 21" aria-hidden>
      <rect fill="#f25022" x="1" y="1" width="9" height="9" />
      <rect fill="#7fba00" x="11" y="1" width="9" height="9" />
      <rect fill="#00a4ef" x="1" y="11" width="9" height="9" />
      <rect fill="#ffb900" x="11" y="11" width="9" height="9" />
    </svg>
  )
}

/**
 * Same layout for every social network: that network's button on top, then the
 * email form. Entra's hosted page always appends "Sign in with Google" under the
 * form; this screen does not.
 */
export function ProviderSignInPage({ providerId, callbackUrl, registerHref = '/register' }: Props) {
  const provider = socialProviderSignIn(providerId)
  const [email, setEmail] = useState('')
  const [starting, setStarting] = useState(false)

  if (!provider) return null

  const startProvider = () => {
    setStarting(true)
    const authorizationParams = provider.hint ? { domain_hint: provider.hint } : undefined
    void signIn(providerId, { callbackUrl }, authorizationParams)
  }

  const callbackForEmail = callbackUrl.startsWith('/') && callbackUrl !== '/' ? callbackUrl : ''

  return (
    <div
      className="fixed inset-0 z-[100020] overflow-y-auto bg-white text-[#1b1b1b]"
      style={{ fontFamily: '"Segoe UI", system-ui, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-[440px] px-6 pb-16 pt-8">
        <button
          type="button"
          onClick={startProvider}
          disabled={starting}
          className="flex w-full items-center gap-3 border border-[#edebe9] bg-[#f3f2f1] px-4 py-3 text-left text-[15px] text-[#323130] disabled:opacity-60"
          style={{ width: '100%' }}
        >
          <ProviderMark label={provider.label} />
          <span>{starting ? 'Opening…' : `Sign in with ${provider.label}`}</span>
        </button>

        <div className="mt-8">
          <p className="text-[13px] font-semibold tracking-[0.04em] text-[#323130]">AIMEDIATANK</p>
          <h1 className="mt-4 text-[22px] font-semibold leading-tight text-[#1b1b1b]">
            Sign in to access aimediatank
          </h1>
          <form
            data-social-form="2"
            className="mt-6"
            onSubmit={(e) => {
              e.preventDefault()
              const trimmed = String(new FormData(e.currentTarget).get('email') || '').trim()
              if (!trimmed) return
              const url = new URL('/login', window.location.origin)
              url.searchParams.set('email', trimmed)
              if (callbackForEmail) url.searchParams.set('callbackUrl', callbackForEmail)
              window.location.href = url.toString()
            }}
          >
            <label htmlFor="social-email" className="block text-[15px] text-[#605e5c]">
              Email address
            </label>
            <input
              id="social-email"
              name="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 w-full py-2 text-[15px] outline-none"
              style={{
                background: 'transparent',
                color: '#1b1b1b',
                border: 'none',
                borderBottom: '1px solid #0067b8',
                borderRadius: 0,
                paddingLeft: 0,
                paddingRight: 0,
                boxShadow: 'none',
              }}
            />
            <div className="mt-6 flex items-center justify-between gap-4">
              <a
                href={registerHref}
                className="text-[15px] text-[#0067b8] hover:underline"
                onClick={(e) => {
                  e.preventDefault()
                  window.location.assign(registerHref)
                }}
              >
                No account? Create one
              </a>
              <button
                type="submit"
                className="bg-[#0067b8] px-6 py-2 text-[15px] font-semibold text-white hover:bg-[#005da6]"
              >
                Next
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
