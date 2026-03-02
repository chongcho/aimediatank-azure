'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import TetrisPage from '@/app/game/tetris/page'

export default function TetrisModal() {
  return (
    <InterceptedPageWrapper>
      <TetrisPage />
    </InterceptedPageWrapper>
  )
}
