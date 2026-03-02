'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import BreakoutPage from '@/app/game/breakout/page'

export default function BreakoutModal() {
  return (
    <InterceptedPageWrapper>
      <BreakoutPage />
    </InterceptedPageWrapper>
  )
}
