'use client'

import AdminReauthGate from '@/components/AdminReauthGate'

type Props = {
  initialAdminUsername: string
  nextPath: string
}

export default function LoginAdminVerifyClient({ initialAdminUsername, nextPath }: Props) {
  return (
    <AdminReauthGate
      verifyMode="adminUser"
      bootstrappedFromServer
      initialAdminUsername={initialAdminUsername}
      onVerified={() => {
        window.location.assign(nextPath)
      }}
    />
  )
}
