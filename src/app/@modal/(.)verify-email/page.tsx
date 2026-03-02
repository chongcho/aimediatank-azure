'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import VerifyEmailPage from '@/app/verify-email/page'

export default function VerifyEmailModal() {
  return (
    <InterceptedPageWrapper>
      <VerifyEmailPage />
    </InterceptedPageWrapper>
  )
}
