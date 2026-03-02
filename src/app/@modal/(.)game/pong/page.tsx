'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import PongPage from '@/app/game/pong/page'

export default function PongModal() {
  return (
    <InterceptedPageWrapper>
      <PongPage />
    </InterceptedPageWrapper>
  )
}
