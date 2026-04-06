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
      verifyMode="adminPanel"
      bootstrappedFromServer
      initialAdminUsername={initialAdminUsername}
      initialAdminPanelPasswordConfigured={initialAdminPanelPasswordConfigured}
      initialDedicatedPasswordRequired={initialDedicatedPasswordRequired}
      onVerified={() => {
        // Plain /admin so middleware does not clear admin_reauth (?ar=1) right after verify sets it.
        window.location.assign('/admin')
      }}
    />
  )
}
