'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ProviderSignInPage } from '@/components/ProviderSignInPage'
import { NATIVE_AUTH_COMPLETE_PATH, safeNextPath } from '@/lib/nativeAuthFlow'

const ALLOWED_PROVIDER = /^(entra-external-id(-(google|facebook|apple|microsoft))?|azure-ad-b2c)$/

function NativeStart() {
  const params = useSearchParams()
  const provider = params.get('provider') || ''
  if (!provider) return null
  if (!ALLOWED_PROVIDER.test(provider)) {
    return (
      <div className="fixed inset-0 z-[100020] flex items-center justify-center bg-white px-6 text-center text-neutral-800">
        <p>Unknown sign-in provider.</p>
      </div>
    )
  }
  const next = safeNextPath(params.get('next'))
  const platform = params.get('platform') === 'ios' ? 'ios' : 'android'
  const callbackUrl = `${NATIVE_AUTH_COMPLETE_PATH}?next=${encodeURIComponent(next)}&platform=${platform}`
  return <ProviderSignInPage providerId={provider} callbackUrl={callbackUrl} />
}

export default function NativeStartPage() {
  return (
    <Suspense fallback={null}>
      <NativeStart />
    </Suspense>
  )
}
