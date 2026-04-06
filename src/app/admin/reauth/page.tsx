import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  isAdminPanelAccessPasswordConfigured,
  isDedicatedAdminPanelPasswordRequired,
} from '@/lib/adminPanelAccessPassword'
import AdminReauthClient from './AdminReauthClient'

export const dynamic = 'force-dynamic'

function isAdminRole(role: unknown): boolean {
  return typeof role === 'string' && role.trim().toUpperCase() === 'ADMIN'
}

export default async function AdminReauthPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent('/admin')}`)
  }
  const role = (session.user as { role?: string }).role
  if (!isAdminRole(role)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-gray-400 text-center">You do not have admin access.</p>
      </div>
    )
  }

  const u = session.user as { username?: string | null; name?: string | null }
  const adminUsername = u.username ?? u.name ?? 'your account'

  return (
    <AdminReauthClient
      initialAdminUsername={adminUsername}
      initialAdminPanelPasswordConfigured={isAdminPanelAccessPasswordConfigured()}
      initialDedicatedPasswordRequired={isDedicatedAdminPanelPasswordRequired()}
    />
  )
}
