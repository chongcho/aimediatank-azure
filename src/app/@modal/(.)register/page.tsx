'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import RegisterPage from '@/app/register/page'

export default function RegisterModal() {
  return (
    <InterceptedPageWrapper>
      <RegisterPage />
    </InterceptedPageWrapper>
  )
}
