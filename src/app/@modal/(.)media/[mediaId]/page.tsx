'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import MediaPageClient from '@/app/media/[mediaId]/MediaPageClient'

export default function MediaModal({ params }: { params: { mediaId: string } }) {
  return (
    <InterceptedPageWrapper>
      <MediaPageClient mediaId={params.mediaId} />
    </InterceptedPageWrapper>
  )
}
