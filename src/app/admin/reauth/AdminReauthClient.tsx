'use client'

import AdminReauthGate from '@/components/AdminReauthGate'

type Props = {
  initialAdminUsername: string
  initialAdminPanelPasswordConfigured: boolean
  initialDedicatedPasswordRequired: boolean
}

export default function AdminReauthClient({
  initialAdminUsername,
  initialAdminPanelPasswordConfigured,
  initialDedicatedPasswordRequired,
}: Props) {
  return (
    <AdminReauthGate
      bootstrappedFromServer
      initialAdminUsername={initialAdminUsername}
      initialAdminPanelPasswordConfigured={initialAdminPanelPasswordConfigured}
      initialDedicatedPasswordRequired={initialDedicatedPasswordRequired}
      onVerified={() => {
        window.location.assign('/')
      }}
    />
  )
}
