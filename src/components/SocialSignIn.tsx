'use client'

import { useState, useEffect } from 'react'
import { signIn, getProviders } from 'next-auth/react'
import { ADMIN_FORCE_STEP2_STORAGE_KEY } from '@/lib/adminFreshStep2'

const SOCIAL_BUTTONS: { id: string; label: string; icon: 'google' | 'facebook' | 'apple' | 'microsoft' }[] = [
  { id: 'entra-external-id-google', label: 'Google', icon: 'google' },
  { id: 'entra-external-id-facebook', label: 'Facebook', icon: 'facebook' },
  { id: 'entra-external-id-apple', label: 'Apple', icon: 'apple' },
  { id: 'entra-external-id-microsoft', label: 'Microsoft', icon: 'microsoft' },
]
const FALLBACK_PROVIDER_IDS = ['entra-external-id', 'azure-ad-b2c']

type Props = {
  mode: 'signin' | 'signup'
  callbackUrl?: string
  /** When true, do not render the "Or continue with" divider above the buttons (e.g. when social is the primary block). */
  hideDividerAbove?: boolean
}

function SocialIcon({ icon }: { icon: 'google' | 'facebook' | 'apple' | 'microsoft' }) {
  const className = 'w-5 h-5 shrink-0'
  if (icon === 'google') {
    return (
      <svg className={className} viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    )
  }
  if (icon === 'facebook') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="#1877F2" aria-hidden>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    )
  }
  if (icon === 'apple') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    )
  }
  return (
    <svg className={className} viewBox="0 0 21 21" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M10.5 2.625v15.75M2.625 10.5h15.75" strokeLinecap="round" />
      <path d="M18.375 10.5a7.875 7.875 0 11-15.75 0 7.875 7.875 0 0115.75 0z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SocialSignIn({ mode, callbackUrl = '/', hideDividerAbove = false }: Props) {
  const [availableIds, setAvailableIds] = useState<Set<string>>(new Set())
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    getProviders().then((providers) => {
      if (!providers) return
      const ids = new Set<string>()
      SOCIAL_BUTTONS.forEach((b) => {
        if (providers[b.id]) ids.add(b.id)
      })
      if (ids.size === 0) {
        const fallback = FALLBACK_PROVIDER_IDS.find((id) => providers[id])
        if (fallback) ids.add(fallback)
      }
      setAvailableIds(ids)
    })
  }, [])

  const handleSocialSignIn = (providerId: string) => {
    setLoadingId(providerId)
    const dest = callbackUrl ?? '/'
    if (/^\/admin(\?|$)/.test(dest)) {
      try {
        sessionStorage.setItem(ADMIN_FORCE_STEP2_STORAGE_KEY, '1')
      } catch {
        /* private mode */
      }
    }
    signIn(providerId, { callbackUrl })
  }

  const hasSocialButtons = SOCIAL_BUTTONS.some((b) => availableIds.has(b.id))
  const fallbackId = FALLBACK_PROVIDER_IDS.find((id) => availableIds.has(id))
  const buttons =
    availableIds.size === 0
      ? []
      : hasSocialButtons
        ? SOCIAL_BUTTONS.filter((b) => availableIds.has(b.id))
        : fallbackId
          ? [{ id: fallbackId, label: 'Microsoft', icon: 'microsoft' as const }]
          : []

  if (buttons.length === 0) return null

  const actionText = mode === 'signin' ? 'Continue with' : 'Register with'

  return (
    <>
      {!hideDividerAbove && (
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-tank-light" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="bg-tank-gray px-3 text-gray-400">Or continue with</span>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {buttons.map((btn) => (
          <button
            key={btn.id}
            type="button"
            onClick={() => handleSocialSignIn(btn.id)}
            disabled={!!loadingId}
            className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border border-tank-light bg-tank-gray hover:bg-tank-light/50 transition-colors disabled:opacity-50"
          >
            {loadingId === btn.id ? (
              <span className="spinner w-5 h-5" />
            ) : (
              <>
                <SocialIcon icon={btn.icon} />
                <span>{actionText} {btn.label}</span>
              </>
            )}
          </button>
        ))}
      </div>
    </>
  )
}
