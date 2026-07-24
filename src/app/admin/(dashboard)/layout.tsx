import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  adminCookieAllowsPanel,
  normalizeAdminReauthScopes,
  slidingAdminReauthCookieForUser,
  verifyAdminReauthCookie,
} from '@/lib/adminReauthCookie'

export const dynamic = 'force-dynamic'

function isAdminRole(role: unknown): boolean {
  return typeof role === 'string' && role.trim().toUpperCase() === 'ADMIN'
}

/**
 * Server-side gate: only users with a valid admin_reauth cookie reach the dashboard.
 * Everyone else is sent to /admin/reauth (Step 2). This cannot be skipped by client JS.
 * Successful access slides the idle timer so active panel use stays elevated.
 */
export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  if (!session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent('/admin')}`)
  }
  const role = (session.user as { role?: string }).role
  if (!isAdminRole(role)) {
    redirect('/')
  }
  const userId = (session.user as { id?: string }).id
  if (!userId) {
    redirect('/admin/reauth')
  }

  const cookieStore = cookies()
  const cookieHeader = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join('; ')
  const payload = verifyAdminReauthCookie(cookieHeader)
  const ok = !!(payload && payload.userId === userId && adminCookieAllowsPanel(payload))
  if (!ok) {
    redirect('/admin/reauth')
  }

  const refreshed = slidingAdminReauthCookieForUser(userId, normalizeAdminReauthScopes(payload!))
  cookieStore.set(refreshed.name, refreshed.value, refreshed.options)

  return <>{children}</>
}
