'use client'

import InterceptedPageWrapper from '@/components/InterceptedPageWrapper'
import ProfilePage from '@/app/profile/[username]/page'

export default function ProfileModal() {
  return (
    <InterceptedPageWrapper>
      <ProfilePage />
    </InterceptedPageWrapper>
  )
}
