'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import CelebrationCardPage from '@/app/card/[cardId]/page'

export default function CardModal({ params }: { params: { cardId: string } }) {
  return (
    <InterceptedPageWrapper>
      <CelebrationCardPage params={params} />
    </InterceptedPageWrapper>
  )
}
