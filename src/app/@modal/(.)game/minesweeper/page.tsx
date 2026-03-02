'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import MinesweeperPage from '@/app/game/minesweeper/page'

export default function MinesweeperModal() {
  return (
    <InterceptedPageWrapper>
      <MinesweeperPage />
    </InterceptedPageWrapper>
  )
}
