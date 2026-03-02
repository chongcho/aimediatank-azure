'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import DonkeyKongPage from '@/app/game/donkeykong/page'

export default function DonkeyKongModal() {
  return (
    <InterceptedPageWrapper>
      <DonkeyKongPage />
    </InterceptedPageWrapper>
  )
}
