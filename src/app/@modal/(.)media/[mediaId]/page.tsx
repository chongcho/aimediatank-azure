'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import MediaPageClient from '@/app/media/[mediaId]/MediaPageClient'
import { parseMediaIdFromRouteParam } from '@/lib/mediaShareUrl'

export default function MediaModal({ params }: { params: { mediaId: string } }) {
  const mediaId = parseMediaIdFromRouteParam(params.mediaId)
  return (
    <InterceptedPageWrapper>
      <MediaPageClient mediaId={mediaId} intercepted />
    </InterceptedPageWrapper>
  )
}
