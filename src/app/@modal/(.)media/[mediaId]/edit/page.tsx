'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import EditMediaPage from '@/app/media/[mediaId]/edit/page'

export default function MediaEditModal() {
  return (
    <InterceptedPageWrapper>
      <EditMediaPage />
    </InterceptedPageWrapper>
  )
}
