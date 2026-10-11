'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { clearSocialSignInReturn, socialProviderSignIn } from '@/lib/socialProviderSignIn'

type Props = {
  providerId: string
  callbackUrl: string
}

/**
 * Email Next stays on Entra. It does not open the app password form.
 */
export function ProviderSignInPage({ providerId, callbackUrl }: Props) {
  const provider = socialProviderSignIn(providerId)
  const [email, setEmail] = useState('')
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setStarting(false)
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [])

  if (!provider) {
    return (
      <div className="fixed inset-0 z-[100020] flex items-center justify-center bg-white px-6 text-center text-neutral-800">
        <p>Unknown sign-in provider.</p>
      </div>
    )
  }

  const startEmail = (address: string) => {
    clearSocialSignInReturn()
    setStarting(true)
    const trimmed = address.trim()
    const authorizationParams = trimmed ? { login_hint: trimmed } : undefined
    void signIn(providerId, { callbackUrl }, authorizationParams)
  }

  return (
    <div
      className="fixed inset-0 z-[100020] overflow-y-auto bg-white text-[#1b1b1b]"
      style={{ fontFamily: '"Segoe UI", system-ui, sans-serif' }}
    >
      <div className="mx-auto w-full max-w-[440px] px-6 pb-16 pt-10">
        <p className="text-[13px] font-semibold text-[#323130]">AiMediaTank</p>
        <h1 className="mt-6 text-[28px] font-semibold leading-tight text-[#1b1b1b]">Sign in</h1>
        <p className="mt-4 text-[15px] text-[#1b1b1b]">Sign in to access aimediatank</p>

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault()
            const trimmed = String(new FormData(e.currentTarget).get('email') || '').trim()
            if (!trimmed) return
            startEmail(trimmed)
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
            <button
              type="button"
              className="text-left text-[15px] text-[#0067b8] hover:underline disabled:opacity-60"
              disabled={starting}
              onClick={() => startEmail(email)}
            >
              No account? Create one
            </button>
            <button
              type="submit"
              disabled={starting}
              className="bg-[#0067b8] px-6 py-2 text-[15px] font-semibold text-white hover:bg-[#005da6] disabled:opacity-60"
            >
              {starting ? 'Opening…' : 'Next'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
