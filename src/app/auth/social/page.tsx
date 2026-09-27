'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ProviderSignInPage } from '@/components/ProviderSignInPage'
import { safeNextPath } from '@/lib/nativeAuthFlow'

function SocialSignInScreen() {
  const params = useSearchParams()
  const provider = params.get('provider') || ''
  const next = safeNextPath(params.get('next'))
  return <ProviderSignInPage providerId={provider} callbackUrl={next} />
}

export default function SocialSignInRoute() {
  return (
    <Suspense fallback={null}>
      <SocialSignInScreen />
    </Suspense>
  )
}
