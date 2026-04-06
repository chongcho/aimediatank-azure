'use client'

import AdminReauthGate from '@/components/AdminReauthGate'

type Props = {
  initialAdminUsername: string
  initialAdminUserStep2Configured: boolean
  nextPath: string
}

export default function LoginAdminVerifyClient({
  initialAdminUsername,
  initialAdminUserStep2Configured,
  nextPath,
}: Props) {
  return (
    <AdminReauthGate
      verifyMode="adminUser"
      bootstrappedFromServer
      initialAdminUsername={initialAdminUsername}
      initialAdminUserStep2Configured={initialAdminUserStep2Configured}
      onVerified={() => {
        window.location.assign(nextPath)
      }}
    />
  )
}
