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

function safeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//')) {
    return v
  }
  return '/admin'
}

export default async function AdminReauthPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const nextPath = safeNext(searchParams.next)
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent(nextPath.startsWith('/admin') ? '/admin' : nextPath)}`)
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
      initialAdminPanelPasswordConfigured={await isAdminPanelAccessPasswordConfigured()}
      initialDedicatedPasswordRequired={isDedicatedAdminPanelPasswordRequired()}
      nextPath={nextPath}
    />
  )
}
