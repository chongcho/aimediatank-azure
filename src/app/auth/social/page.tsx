'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { ProviderSignInPage } from '@/components/ProviderSignInPage'
import { safeNextPath } from '@/lib/nativeAuthFlow'
import { socialSignInMode } from '@/lib/socialProviderSignIn'

function SocialSignInScreen() {
  const params = useSearchParams()
  const provider = params.get('provider') || ''
  const next = safeNextPath(params.get('next'))
  const mode = socialSignInMode(params.get('mode'))
  return <ProviderSignInPage providerId={provider} callbackUrl={next} mode={mode} />
}

export default function SocialSignInRoute() {
  return (
    <Suspense fallback={null}>
      <SocialSignInScreen />
    </Suspense>
  )
}
