'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { NATIVE_HANDOFF_PROVIDER_ID, safeNextPath } from '@/lib/nativeAuthFlow'

/**
 * Runs inside the app WebView. Redeems the one-time code from the system-browser sign-in so the
 * WebView gets its own NextAuth session cookie.
 */
function NativeReturn() {
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const redeemed = useRef(false)

  useEffect(() => {
    // Codes are single-use; React strict-mode double effects would burn the code.
    if (redeemed.current) return
    redeemed.current = true

    const code = params.get('code') || ''
    const next = safeNextPath(params.get('next'))
    if (!code) {
      setError('Sign-in link was incomplete.')
      return
    }

    void (async () => {
      const result = await signIn(NATIVE_HANDOFF_PROVIDER_ID, { code, redirect: false })
      if (result?.ok) {
        window.location.replace(next)
      } else {
        setError(result?.error || 'Sign-in could not be completed.')
      }
    })()
  }, [params])

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-red-400">{error}</p>
        <a href="/login" className="text-blue-400 underline">
          Back to log in
        </a>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      <p className="text-gray-300">Finishing sign-in…</p>
    </div>
  )
}

export default function NativeReturnPage() {
  return (
    <Suspense fallback={null}>
      <NativeReturn />
    </Suspense>
  )
}
