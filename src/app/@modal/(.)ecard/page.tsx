'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import EcardPage from '@/app/ecard/page'

export default function EcardModal() {
  return (
    <InterceptedPageWrapper>
      <EcardPage />
    </InterceptedPageWrapper>
  )
}
