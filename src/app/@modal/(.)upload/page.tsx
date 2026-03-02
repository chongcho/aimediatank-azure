'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import UploadPage from '@/app/upload/page'

export default function UploadModal() {
  return (
    <InterceptedPageWrapper>
      <UploadPage />
    </InterceptedPageWrapper>
  )
}
