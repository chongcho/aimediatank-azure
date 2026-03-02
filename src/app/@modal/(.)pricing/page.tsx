'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import PricingPage from '@/app/pricing/page'

export default function PricingModal() {
  return (
    <InterceptedPageWrapper>
      <PricingPage />
    </InterceptedPageWrapper>
  )
}
