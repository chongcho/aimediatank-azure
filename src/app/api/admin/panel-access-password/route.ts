import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { compare, hash } from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { getAdminPanelAccessPasswordStatus } from '@/lib/adminPanelAccessPassword'
import { getFirstMediaDetailSetting } from '@/lib/mediaDetailSetting'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const AUTH_HASH_KEY = 'adminPanelAccessPasswordHash'

function sessionUserIsAdmin(session: { user?: { role?: string | null } } | null): boolean {
  const r = session?.user?.role
  return typeof r === 'string' && r.trim().toUpperCase() === 'ADMIN'
}

/**
 * POST: set Admin Panel passphrase from Profile Edit.
 * Proves identity with the account login password (not the current panel passphrase),
 * so a forgotten panel passphrase is not a permanent lockout.
 * Does not require Admin Panel elevation.
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !sessionUserIsAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const accountPassword = typeof body?.accountPassword === 'string' ? body.accountPassword : ''
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''
    const confirmPassword = typeof body?.confirmPassword === 'string' ? body.confirmPassword : ''

    if (!accountPassword) {
      return NextResponse.json({ error: 'Account login password is required' }, { status: 400 })
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 })
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ error: 'New password and confirmation do not match' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true },
    })
    if (!user?.password) {
      return NextResponse.json(
        {
          error:
            'This account has no login password set. Use Azure app settings to set ADMIN_PANEL_ACCESS_PASSWORD_HASH.',
        },
        { status: 400 }
      )
    }
    const accountOk = await compare(accountPassword, user.password)
    if (!accountOk) {
      return NextResponse.json({ error: 'Account login password is incorrect' }, { status: 400 })
    }

    const passwordHash = await hash(newPassword, 12)
    let row = await getFirstMediaDetailSetting()
    if (!row) {
      row = await prisma.mediaDetailSetting.create({ data: {} })
    }
    const raw =
      row.shareAppsEnabled &&
      typeof row.shareAppsEnabled === 'object' &&
      !Array.isArray(row.shareAppsEnabled)
        ? ({ ...(row.shareAppsEnabled as Record<string, unknown>) } as Record<string, unknown>)
        : {}
    const prevAuth =
      raw.__auth && typeof raw.__auth === 'object' && !Array.isArray(raw.__auth)
        ? (raw.__auth as Record<string, unknown>)
        : {}

    await prisma.mediaDetailSetting.update({
      where: { id: row.id },
      data: {
        shareAppsEnabled: {
          ...raw,
          __auth: {
            ...prevAuth,
            [AUTH_HASH_KEY]: passwordHash,
          },
        } as Prisma.InputJsonValue,
      },
    })

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
            via: 'profile-account-password',
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
