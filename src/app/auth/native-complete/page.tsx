'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { buildNativeReturnUrl, safeNextPath } from '@/lib/nativeAuthFlow'

/**
 * Runs in the system browser after social sign-in succeeded there. Mints a one-time code and
 * hands it to the app over the custom URL scheme, which closes the browser sheet.
 */
function NativeComplete() {
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)
  const [returnUrl, setReturnUrl] = useState<string | null>(null)

  useEffect(() => {
    const next = safeNextPath(params.get('next'))
    const platform = params.get('platform') === 'ios' ? 'ios' : 'android'

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/auth/native-handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform }),
          credentials: 'include',
        })
        if (!res.ok) {
          throw new Error(res.status === 401 ? 'Sign-in did not complete.' : 'Could not finish sign-in.')
        }
        const { code } = (await res.json()) as { code?: string }
        if (!code) throw new Error('Could not finish sign-in.')
        if (cancelled) return

        const url = buildNativeReturnUrl(code, next)
        setReturnUrl(url)
        window.location.replace(url)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not finish sign-in.')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [params])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
      {error ? (
        <p className="text-red-400">{error} Please return to the app and try again.</p>
      ) : (
        <>
          <p className="text-gray-300">Signing you in…</p>
          {/* Some browsers block an automatic custom-scheme navigation without a tap. */}
          {returnUrl && (
            <a href={returnUrl} className="text-blue-400 underline">
              Return to AiMediaTank
            </a>
          )}
        </>
      )}
    </div>
  )
}

export default function NativeCompletePage() {
  return (
    <Suspense fallback={null}>
      <NativeComplete />
    </Suspense>
  )
}
