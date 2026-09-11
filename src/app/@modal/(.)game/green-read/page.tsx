'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import GreenReadPage from '@/app/game/green-read/page'

export default function GreenReadModal() {
  return (
    <InterceptedPageWrapper>
      <GreenReadPage />
    </InterceptedPageWrapper>
  )
}
