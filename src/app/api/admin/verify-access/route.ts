import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  isAdminPanelAccessPasswordConfigured,
  isDedicatedAdminPanelPasswordRequired,
  verifyAdminPanelAccessPassword,
} from '@/lib/adminPanelAccessPassword'
import {
  isAdminUserStep2PasswordConfigured,
  verifyAdminUserStep2Password,
} from '@/lib/adminUserStep2Password'
import {
  adminCookieAllowsContentElevation,
  adminCookieAllowsPanel,
  applySlidingAdminReauthCookie,
  createAdminReauthCookie,
  getAdminReauthFromRequest,
} from '@/lib/adminReauthCookie'
import { buildExpiredAdminReauthCookie, ADMIN_REAUTH_IDLE_SEC } from '@/lib/adminReauthConstants'
import { verifyCode } from '@/lib/verificationCodes'
import { verifyPhoneCode, normalizePhone } from '@/lib/phoneVerificationCodes'

export const dynamic = 'force-dynamic'

function sessionUserIsAdmin(session: { user?: { role?: string | null } } | null): boolean {
  const r = session?.user?.role
  return typeof r === 'string' && r.trim().toUpperCase() === 'ADMIN'
}

// GET: Check admin re-auth cookie, or ?init=1 = atomically clear cookie + require Step 2 (no race with client POST clear).
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !sessionUserIsAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const adminPanelPasswordConfigured = await isAdminPanelAccessPasswordConfigured()
    const dedicatedPasswordRequired = isDedicatedAdminPanelPasswordRequired()
    const adminUserStep2Configured = await isAdminUserStep2PasswordConfigured()

    const url = new URL(request.url)
    if (url.searchParams.get('init') === '1') {
      const res = NextResponse.json({
        verified: false,
        panelElevated: false,
        contentElevated: false,
        adminPanelPasswordConfigured,
        dedicatedPasswordRequired,
        adminUserStep2Configured,
      })
      const cleared = buildExpiredAdminReauthCookie()
      res.cookies.set(cleared.name, cleared.value, cleared.options)
      return res
    }

    const payload = getAdminReauthFromRequest(request)
    const okUser = !!(payload && payload.userId === session.user.id)
    const panelElevated =
      !!payload && payload.userId === session.user.id && adminCookieAllowsPanel(payload)
    const contentElevated =
      !!payload && payload.userId === session.user.id && adminCookieAllowsContentElevation(payload)
    if (!okUser) {
      return NextResponse.json({
        verified: false,
        panelElevated: false,
        contentElevated: false,
        adminPanelPasswordConfigured,
        dedicatedPasswordRequired,
        adminUserStep2Configured,
      })
    }
    const res = NextResponse.json({
      verified: true,
      panelElevated,
      contentElevated,
      adminPanelPasswordConfigured,
      dedicatedPasswordRequired,
      adminUserStep2Configured,
      idleSec: ADMIN_REAUTH_IDLE_SEC,
    })
    // Sliding idle: any successful elevation check renews the cookie while admin is active.
    applySlidingAdminReauthCookie(res, request, session.user.id)
    return res
  } catch (e) {
    console.error('Admin verify-access GET error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST: Verify password + 2FA. adminUser sets admin_reauth with app scope; adminPanel sets panel scope.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !sessionUserIsAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json()
    const rawMode = body?.verifyMode
    const verifyMode =
      typeof rawMode === 'string' && rawMode.trim() === 'adminUser' ? 'adminUser' : 'adminPanel'
    const password = typeof body?.password === 'string' ? body.password : ''
    const channel = body?.channel === 'phone' ? 'phone' : 'email'
    const code = typeof body?.code === 'string' ? body.code.trim() : ''

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, phone: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (verifyMode === 'adminUser') {
      if (!(await isAdminUserStep2PasswordConfigured())) {
        return NextResponse.json(
          {
            error:
              'Admin login Step 2 requires a Step 2 password (set in Profile Edit, or ADMIN_USER_STEP2_PASSWORD_HASH / ADMIN_USER_STEP2_PASSWORD on the server)—separate from your account login password.',
          },
          { status: 503 }
        )
      }
      if (!password) {
        return NextResponse.json({ error: 'Admin login passphrase is required' }, { status: 400 })
      }
      const validUserStep2 = await verifyAdminUserStep2Password(password)
      if (!validUserStep2) {
        return NextResponse.json({ error: 'Invalid admin login passphrase' }, { status: 400 })
      }
    } else {
      if (isDedicatedAdminPanelPasswordRequired() && !(await isAdminPanelAccessPasswordConfigured())) {
        return NextResponse.json(
          {
            error:
              'Server policy requires a dedicated admin panel password. Set ADMIN_PANEL_ACCESS_PASSWORD_HASH (or ADMIN_REQUIRE_DEDICATED_PANEL_PASSWORD=false).',
          },
          { status: 503 }
        )
      }
      if (!(await isAdminPanelAccessPasswordConfigured())) {
        return NextResponse.json(
          {
            error:
              'Admin Panel access requires an Admin Panel passphrase (set in Admin → Authentication or Profile Edit, or ADMIN_PANEL_ACCESS_PASSWORD_HASH / ADMIN_PANEL_ACCESS_PASSWORD on the server)—separate from your account login password.',
          },
          { status: 503 }
        )
      }
      if (!password) {
        return NextResponse.json({ error: 'Admin panel password is required' }, { status: 400 })
      }
      const validPanel = await verifyAdminPanelAccessPassword(password)
      if (!validPanel) {
        return NextResponse.json({ error: 'Invalid admin panel password' }, { status: 400 })
      }
    }

    // Verify 2FA code
    if (!code || code.length < 6) {
      return NextResponse.json({ error: 'Verification code is required' }, { status: 400 })
    }
    if (channel === 'email') {
      const email = (session.user as { email?: string }).email ?? user.email
      if (!email) {
        return NextResponse.json({ error: 'No email on account. Use phone verification.' }, { status: 400 })
      }
      const result = await verifyCode(email, code)
      if (!result.valid) {
        return NextResponse.json({ error: result.error || 'Invalid code' }, { status: 400 })
      }
    } else {
      const phone = user.phone
      if (!phone || normalizePhone(phone).length < 10) {
        return NextResponse.json({ error: 'No phone on profile. Add a phone in Profile or use email verification.' }, { status: 400 })
      }
      const result = await verifyPhoneCode(phone, code)
      if (!result.valid) {
        return NextResponse.json({ error: result.error || 'Invalid code' }, { status: 400 })
      }
    }

    if (verifyMode === 'adminUser') {
      const { name, value, options } = createAdminReauthCookie(user.id, ['app'])
      const res = NextResponse.json({ success: true, verifyMode: 'adminUser' })
      res.cookies.set(name, value, options)
      return res
    }

    const { name, value, options } = createAdminReauthCookie(user.id, ['panel'])
    const res = NextResponse.json({ success: true, verifyMode: 'adminPanel' })
    res.cookies.set(name, value, options)
    return res
  } catch (e) {
    console.error('Admin verify-access POST error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
