import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isAdminUserStep2PasswordConfigured } from '@/lib/adminUserStep2Password'
import LoginAdminVerifyClient from './LoginAdminVerifyClient'

export const dynamic = 'force-dynamic'

function isAdminRole(role: unknown): boolean {
  return typeof role === 'string' && role.trim().toUpperCase() === 'ADMIN'
}

function safeNext(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  if (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//')) {
    return v
  }
  return '/'
}

export default async function AdminLoginVerifyPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect('/login')
  }
  if (!isAdminRole((session.user as { role?: string }).role)) {
    redirect('/')
  }

  const userId = (session.user as { id?: string }).id
  if (!userId) {
    redirect('/login')
  }

  const nextPath = safeNext(searchParams.next)
  const adminUserStep2Configured = isAdminUserStep2PasswordConfigured()

  const u = session.user as { username?: string | null; name?: string | null }
  const adminUsername = u.username ?? u.name ?? 'your account'

  return (
    <LoginAdminVerifyClient
      initialAdminUsername={adminUsername}
      initialAdminUserStep2Configured={adminUserStep2Configured}
      nextPath={nextPath}
    />
  )
}
