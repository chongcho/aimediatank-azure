'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import LoginPage from '@/app/login/page'

export default function LoginModal() {
  return (
    <InterceptedPageWrapper>
      <LoginPage />
    </InterceptedPageWrapper>
  )
}
