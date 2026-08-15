import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { compare } from 'bcryptjs'
import { authOptions } from '@/lib/auth'
import {
  clearAdminUserStep2PasswordDbOverride,
  getAdminUserStep2PasswordStatus,
  setAdminUserStep2Password,
} from '@/lib/adminUserStep2Password'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

function sessionUserIsAdmin(session: { user?: { role?: string | null } } | null): boolean {
  const r = session?.user?.role
  return typeof r === 'string' && r.trim().toUpperCase() === 'ADMIN'
}

/** Account login password is an alternate identity proof when the current Step 2 value is lost. */
async function accountPasswordMatches(userId: string, accountPassword: string): Promise<boolean> {
  if (!accountPassword) return false
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  })
  if (!user?.password) return false
  try {
    return await compare(accountPassword, user.password)
  } catch {
    return false
  }
}

async function logAdminAction(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>
) {
  try {
    await prisma.adminAction.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        details: JSON.stringify(details),
      },
    })
  } catch (e) {
    console.error('Failed to write admin log for Step 2 password change:', e)
  }
}

/** GET: status of Admin Account Step 2 password (admin session only; no panel elevation). */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !sessionUserIsAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const status = await getAdminUserStep2PasswordStatus()
    return NextResponse.json({
      adminUserStep2Configured: status.configured,
      adminUserStep2Source: status.source,
      adminUserStep2EnvConfigured: status.envConfigured,
      adminUserStep2DatabaseOverride: status.databaseOverride,
    })
  } catch (e) {
    console.error('Admin user Step 2 password GET error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

/**
 * POST: set or clear Admin Account Step 2 password.
 * Requires admin session only (usable from Profile Edit without Admin Panel elevation).
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id || !sessionUserIsAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const action = typeof body?.action === 'string' ? body.action : ''
    const data = body?.data && typeof body.data === 'object' ? body.data : {}

    if (action === 'set') {
      const accountPassword = typeof data.accountPassword === 'string' ? data.accountPassword : ''
      const recoveredByAccountPassword = accountPassword
        ? await accountPasswordMatches(session.user.id, accountPassword)
        : false
      if (accountPassword && !recoveredByAccountPassword) {
        return NextResponse.json({ error: 'Account login password is incorrect' }, { status: 400 })
      }
      const result = await setAdminUserStep2Password({
        currentPassword: typeof data.currentPassword === 'string' ? data.currentPassword : '',
        newPassword: typeof data.newPassword === 'string' ? data.newPassword : '',
        confirmPassword: typeof data.confirmPassword === 'string' ? data.confirmPassword : '',
        skipCurrentPasswordCheck: recoveredByAccountPassword,
      })
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      const status = await getAdminUserStep2PasswordStatus()
      await logAdminAction(session.user.id, 'SET_ADMIN_USER_STEP2_PASSWORD', 'AUTHENTICATION', session.user.id, {
        source: status.source,
        databaseOverride: status.databaseOverride,
        via: recoveredByAccountPassword ? 'profile-account-password' : 'profile',
      })
      return NextResponse.json({
        message: 'Admin Account Step 2 password updated',
        adminUserStep2Configured: status.configured,
        adminUserStep2Source: status.source,
        adminUserStep2EnvConfigured: status.envConfigured,
        adminUserStep2DatabaseOverride: status.databaseOverride,
      })
    }

    if (action === 'clear') {
      const result = await clearAdminUserStep2PasswordDbOverride(
        typeof data.currentPassword === 'string' ? data.currentPassword : ''
      )
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 })
      }
      const status = await getAdminUserStep2PasswordStatus()
      await logAdminAction(session.user.id, 'CLEAR_ADMIN_USER_STEP2_PASSWORD_DB', 'AUTHENTICATION', session.user.id, {
        source: status.source,
        via: 'profile',
      })
      return NextResponse.json({
        message: 'Database Step 2 password override cleared; server env is in use again',
        adminUserStep2Configured: status.configured,
        adminUserStep2Source: status.source,
        adminUserStep2EnvConfigured: status.envConfigured,
        adminUserStep2DatabaseOverride: status.databaseOverride,
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e) {
    console.error('Admin user Step 2 password POST error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
