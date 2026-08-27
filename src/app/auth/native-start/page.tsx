'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { NATIVE_AUTH_COMPLETE_PATH, safeNextPath } from '@/lib/nativeAuthFlow'

const ALLOWED_PROVIDER = /^(entra-external-id(-(google|facebook|apple|microsoft))?|azure-ad-b2c)$/

function NativeStart() {
  const params = useSearchParams()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const provider = params.get('provider') || ''
    if (!ALLOWED_PROVIDER.test(provider)) {
      setError('Unknown sign-in provider.')
      return
    }
    const next = safeNextPath(params.get('next'))
    const platform = params.get('platform') === 'ios' ? 'ios' : 'android'
    const callbackUrl = `${NATIVE_AUTH_COMPLETE_PATH}?next=${encodeURIComponent(next)}&platform=${platform}`
    void signIn(provider, { callbackUrl })
  }, [params])

  return (
    <div className="min-h-screen flex items-center justify-center px-6 text-center">
      {error ? (
        <p className="text-red-400">{error}</p>
      ) : (
        <p className="text-gray-300">Opening secure sign-in…</p>
      )}
    </div>
  )
}

export default function NativeStartPage() {
  return (
    <Suspense fallback={null}>
      <NativeStart />
    </Suspense>
  )
}
