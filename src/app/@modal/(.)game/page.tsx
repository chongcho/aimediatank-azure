'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import PlayPage from '@/app/game/page'

export default function GameModal() {
  return (
    <InterceptedPageWrapper>
      <PlayPage />
    </InterceptedPageWrapper>
  )
}
