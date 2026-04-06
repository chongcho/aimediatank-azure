import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { compare } from 'bcryptjs'
import {
  isAdminPanelAccessPasswordConfigured,
  isDedicatedAdminPanelPasswordRequired,
  verifyAdminPanelAccessPassword,
} from '@/lib/adminPanelAccessPassword'
import { createAdminReauthCookie, getAdminReauthFromRequest } from '@/lib/adminReauthCookie'
import { buildExpiredAdminReauthCookie } from '@/lib/adminReauthConstants'
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
    const adminPanelPasswordConfigured = isAdminPanelAccessPasswordConfigured()
    const dedicatedPasswordRequired = isDedicatedAdminPanelPasswordRequired()

    const url = new URL(request.url)
    if (url.searchParams.get('init') === '1') {
      const res = NextResponse.json({
        verified: false,
        adminPanelPasswordConfigured,
        dedicatedPasswordRequired,
      })
      const cleared = buildExpiredAdminReauthCookie()
      res.cookies.set(cleared.name, cleared.value, cleared.options)
      return res
    }

    const payload = getAdminReauthFromRequest(request)
    const verified = !!(payload && payload.userId === session.user.id)
    if (!verified) {
      return NextResponse.json({
        verified: false,
        adminPanelPasswordConfigured,
        dedicatedPasswordRequired,
      })
    }
    return NextResponse.json({
      verified: true,
      adminPanelPasswordConfigured,
      dedicatedPasswordRequired,
    })
  } catch (e) {
    console.error('Admin verify-access GET error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST: Verify password + 2FA. verifyMode: adminUser = account password only, no cookie. adminPanel = panel env password + admin_reauth cookie.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || !sessionUserIsAdmin(session)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json()
    const verifyMode = body?.verifyMode === 'adminUser' ? 'adminUser' : 'adminPanel'
    const password = typeof body?.password === 'string' ? body.password : ''
    const channel = body?.channel === 'phone' ? 'phone' : 'email'
    const code = typeof body?.code === 'string' ? body.code.trim() : ''

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true, email: true, phone: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (verifyMode === 'adminUser') {
      const hasPassword = user.password && user.password.length > 0
      if (!hasPassword) {
        return NextResponse.json(
          {
            error:
              'This account has no password on file (e.g. social sign-in only). You can continue to the site; use Admin Panel from the menu with the panel passphrase when needed.',
          },
          { status: 400 }
        )
      }
      if (!password) {
        return NextResponse.json({ error: 'Password is required' }, { status: 400 })
      }
      const valid = await compare(password, user.password)
      if (!valid) {
        return NextResponse.json({ error: 'Invalid account password' }, { status: 400 })
      }
    } else {
      if (isDedicatedAdminPanelPasswordRequired() && !isAdminPanelAccessPasswordConfigured()) {
        return NextResponse.json(
          {
            error:
              'Server policy requires a dedicated admin panel password. Set ADMIN_PANEL_ACCESS_PASSWORD_HASH (or ADMIN_REQUIRE_DEDICATED_PANEL_PASSWORD=false).',
          },
          { status: 503 }
        )
      }
      if (!isAdminPanelAccessPasswordConfigured()) {
        return NextResponse.json(
          {
            error:
              'Admin Panel access requires ADMIN_PANEL_ACCESS_PASSWORD_HASH (or ADMIN_PANEL_ACCESS_PASSWORD for local dev)—a passphrase separate from your account login password.',
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
      return NextResponse.json({ success: true, verifyMode: 'adminUser' })
    }

    const { name, value, options } = createAdminReauthCookie(user.id)
    const res = NextResponse.json({ success: true, verifyMode: 'adminPanel' })
    res.cookies.set(name, value, options)
    return res
  } catch (e) {
    console.error('Admin verify-access POST error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
