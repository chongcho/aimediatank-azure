'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import PrivacyPage from '@/app/privacy/page'

export default function PrivacyModal() {
  return (
    <InterceptedPageWrapper>
      <PrivacyPage />
    </InterceptedPageWrapper>
  )
}
