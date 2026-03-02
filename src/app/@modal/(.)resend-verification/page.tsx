'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import ResendVerificationPage from '@/app/resend-verification/page'

export default function ResendVerificationModal() {
  return (
    <InterceptedPageWrapper>
      <ResendVerificationPage />
    </InterceptedPageWrapper>
  )
}
