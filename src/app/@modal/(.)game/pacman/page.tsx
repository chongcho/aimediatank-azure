'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import PacManPage from '@/app/game/pacman/page'

export default function PacManModal() {
  return (
    <InterceptedPageWrapper>
      <PacManPage />
    </InterceptedPageWrapper>
  )
}
