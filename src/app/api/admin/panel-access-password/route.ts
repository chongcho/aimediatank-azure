import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getAdminPanelAccessPasswordStatus,
  setAdminPanelAccessPassword,
} from '@/lib/adminPanelAccessPassword'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function sessionUserIsAdmin(session: { user?: { role?: string | null } } | null): boolean {
  const r = session?.user?.role
  return typeof r === 'string' && r.trim().toUpperCase() === 'ADMIN'
}

/**
 * POST: set Admin Panel passphrase from Profile Edit.
 * Requires the current Admin Panel passphrase when one is already configured.
 * Does not require Admin Panel elevation.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !sessionUserIsAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const currentPassword =
      typeof body?.currentPassword === 'string'
        ? body.currentPassword
        : typeof body?.accountPassword === 'string'
          ? body.accountPassword
          : ''
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''
    const confirmPassword = typeof body?.confirmPassword === 'string' ? body.confirmPassword : ''

    const result = await setAdminPanelAccessPassword({
      currentPassword,
      newPassword,
      confirmPassword,
    })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    const status = await getAdminPanelAccessPasswordStatus()
    try {
      await prisma.adminAction.create({
        data: {
          adminId: session.user.id,
          action: 'SET_ADMIN_PANEL_ACCESS_PASSWORD',
          targetType: 'AUTHENTICATION',
          targetId: session.user.id,
          details: JSON.stringify({
            source: status.source,
            databaseOverride: status.databaseOverride,
            via: 'profile',
          }),
        },
      })
    } catch (e) {
      console.error('Failed to log panel password reset from profile:', e)
    }

    return NextResponse.json({
      message: 'Admin Panel password updated',
      adminPanelAccessConfigured: status.configured,
      adminPanelAccessSource: status.source,
      adminPanelAccessEnvConfigured: status.envConfigured,
      adminPanelAccessDatabaseOverride: status.databaseOverride,
    })
  } catch (e) {
    console.error('Admin panel-access-password POST error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
