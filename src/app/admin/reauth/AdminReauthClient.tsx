'use client'

import AdminReauthGate from '@/components/AdminReauthGate'

type Props = {
  initialAdminUsername: string
  initialAdminPanelPasswordConfigured: boolean
  initialDedicatedPasswordRequired: boolean
  nextPath?: string
}

export default function AdminReauthClient({
  initialAdminUsername,
  initialAdminPanelPasswordConfigured,
  initialDedicatedPasswordRequired,
  nextPath = '/admin',
}: Props) {
  return (
    <AdminReauthGate
      verifyMode="adminPanel"
      bootstrappedFromServer
      initialAdminUsername={initialAdminUsername}
      initialAdminPanelPasswordConfigured={initialAdminPanelPasswordConfigured}
      initialDedicatedPasswordRequired={initialDedicatedPasswordRequired}
      onVerified={() => {
        // Prefer an in-app return path (e.g. media moderation). Default to /admin without ?ar=1
        // so middleware does not clear admin_reauth right after verify sets it.
        const dest =
          typeof nextPath === 'string' && nextPath.startsWith('/') && !nextPath.startsWith('//')
            ? nextPath
            : '/admin'
        window.location.assign(dest)
      }}
    />
  )
}
