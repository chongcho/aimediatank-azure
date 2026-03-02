'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import TermsPage from '@/app/terms/page'

export default function TermsModal() {
  return (
    <InterceptedPageWrapper>
      <TermsPage />
    </InterceptedPageWrapper>
  )
}
