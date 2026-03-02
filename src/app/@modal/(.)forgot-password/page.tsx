'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import ForgotPasswordPage from '@/app/forgot-password/page'

export default function ForgotPasswordModal() {
  return (
    <InterceptedPageWrapper>
      <ForgotPasswordPage />
    </InterceptedPageWrapper>
  )
}
