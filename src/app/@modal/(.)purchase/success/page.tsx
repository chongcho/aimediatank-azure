'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import PurchaseSuccessPage from '@/app/purchase/success/page'

export default function PurchaseSuccessModal() {
  return (
    <InterceptedPageWrapper>
      <PurchaseSuccessPage />
    </InterceptedPageWrapper>
  )
}
