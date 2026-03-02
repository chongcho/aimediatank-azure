'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import PolicyPage from '@/app/policy/page'

export default function PolicyModal() {
  return (
    <InterceptedPageWrapper>
      <PolicyPage />
    </InterceptedPageWrapper>
  )
}
