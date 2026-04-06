import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { compare } from 'bcryptjs'
import {
  isAdminPanelAccessPasswordConfigured,
  verifyAdminPanelAccessPassword,
} from '@/lib/adminPanelAccessPassword'

function dedicatedAdminPanelPasswordRequired(): boolean {
  return process.env.ADMIN_REQUIRE_DEDICATED_PANEL_PASSWORD === 'true'
}
import { createAdminReauthCookie, getAdminReauthFromRequest } from '@/lib/adminReauthCookie'
import { verifyCode } from '@/lib/verificationCodes'
import { verifyPhoneCode, normalizePhone } from '@/lib/phoneVerificationCodes'

export const dynamic = 'force-dynamic'

// GET: Check if current session has a valid admin re-auth cookie
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const payload = getAdminReauthFromRequest(request)
    const adminPanelPasswordConfigured = isAdminPanelAccessPasswordConfigured()
    const dedicatedPasswordRequired = dedicatedAdminPanelPasswordRequired()
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

// POST: Verify password + 2FA code and set admin re-auth cookie
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json()
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

    if (dedicatedAdminPanelPasswordRequired() && !isAdminPanelAccessPasswordConfigured()) {
      return NextResponse.json(
        {
          error:
            'Server policy requires a dedicated admin panel password. Set ADMIN_PANEL_ACCESS_PASSWORD_HASH (or ADMIN_REQUIRE_DEDICATED_PANEL_PASSWORD=false to allow legacy account-password verification).',
        },
        { status: 503 }
      )
    }

    const useAdminPanelPassword = isAdminPanelAccessPasswordConfigured()
    if (useAdminPanelPassword) {
      if (!password) {
        return NextResponse.json({ error: 'Admin panel password is required' }, { status: 400 })
      }
      const validPanel = await verifyAdminPanelAccessPassword(password)
      if (!validPanel) {
        return NextResponse.json({ error: 'Invalid admin panel password' }, { status: 400 })
      }
    } else {
      // Legacy: same as account login password for credential-based accounts
      const hasPassword = user.password && user.password.length > 0
      if (hasPassword) {
        if (!password) {
          return NextResponse.json({ error: 'Password is required' }, { status: 400 })
        }
        const valid = await compare(password, user.password)
        if (!valid) {
          return NextResponse.json({ error: 'Invalid password' }, { status: 400 })
        }
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

    const { name, value, options } = createAdminReauthCookie(user.id)
    const res = NextResponse.json({ success: true })
    res.cookies.set(name, value, options)
    return res
  } catch (e) {
    console.error('Admin verify-access POST error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
