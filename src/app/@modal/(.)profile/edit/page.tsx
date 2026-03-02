'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import EditProfilePage from '@/app/profile/edit/page'

export default function ProfileEditModal() {
  return (
    <InterceptedPageWrapper>
      <EditProfilePage />
    </InterceptedPageWrapper>
  )
}
