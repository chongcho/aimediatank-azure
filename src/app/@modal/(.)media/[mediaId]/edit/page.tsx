'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import EditMediaPageContent from '@/app/media/[mediaId]/edit/EditMediaPageContent'

export default function MediaEditModal() {
  return (
    <InterceptedPageWrapper>
      <EditMediaPageContent intercepted />
    </InterceptedPageWrapper>
  )
}
