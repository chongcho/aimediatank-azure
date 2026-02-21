'use client'

import { useState, useEffect } from 'react'
import { signIn, getProviders } from 'next-auth/react'

const ENTRA_PROVIDER_IDS = ['entra-external-id', 'azure-ad-b2c']

type Props = {
  mode: 'signin' | 'signup'
  callbackUrl?: string
}

export function SocialSignIn({ mode, callbackUrl = '/' }: Props) {
  const [socialProviderId, setSocialProviderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    getProviders().then((providers) => {
      const id = providers ? ENTRA_PROVIDER_IDS.find((id) => providers[id]) ?? null : null
      setSocialProviderId(id ?? null)
    })
  }, [])

  const handleSocialSignIn = () => {
    if (!socialProviderId) return
    setLoading(true)
    signIn(socialProviderId, { callbackUrl })
  }

  if (!socialProviderId) return null

  return (
    <>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-tank-light" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="bg-tank-gray px-3 text-gray-400">Or continue with</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleSocialSignIn}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors disabled:opacity-50"
      >
        {loading ? (
          <span className="spinner w-5 h-5" />
        ) : (
          <>
            <svg className="w-5 h-5" viewBox="0 0 21 21" fill="none" aria-hidden>
              <path
                d="M10.5 2.625v15.75M2.625 10.5h15.75"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M18.375 10.5a7.875 7.875 0 11-15.75 0 7.875 7.875 0 0115.75 0z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>
              {mode === 'signin'
                ? 'Continue with Microsoft'
                : 'Sign up with Microsoft'}
            </span>
          </>
        )}
      </button>
    </>
  )
}
