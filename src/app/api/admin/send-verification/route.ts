import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateCode, storeCode } from '@/lib/verificationCodes'
import { storePhoneCode, normalizePhone } from '@/lib/phoneVerificationCodes'
import { sendEmail } from '@/lib/email'
import { isAzureSmsConfigured, sendAzureSms } from '@/lib/azureSms'

export const dynamic = 'force-dynamic'

const ADMIN_EMAIL_HTML = (code: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">🔐 Admin Panel Verification</h1>
  </div>
  <p style="font-size: 16px;">Your verification code to access the Admin Panel is:</p>
  <div style="text-align: center; margin: 30px 0;">
    <div style="display: inline-block; background: #f8f9fa; padding: 20px 40px; border-radius: 12px; border: 2px dashed #0f8;">
      <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: monospace; color: #1a1a2e;">${code}</span>
    </div>
  </div>
  <p style="font-size: 14px; color: #666;">This code expires in 10 minutes. If you didn't request it, secure your account.</p>
  <p style="font-size: 14px; color: #666;">AI Media Tank (AMT)</p>
</body>
</html>
`

const SMS_MESSAGE = (code: string) =>
  `Your AI Media Tank (AMT) Admin Panel verification code is: ${code}. It expires in 10 minutes.`

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const channel = body?.channel === 'phone' ? 'phone' : 'email'

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, email: true, phone: true },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const code = generateCode()

    if (channel === 'email') {
      const email = (session.user as { email?: string }).email ?? user.email
      if (!email) {
        return NextResponse.json({ error: 'No email on account. Use phone verification.' }, { status: 400 })
      }
      const normalizedEmail = email.toLowerCase()
      await storeCode(normalizedEmail, code, 10)
      const emailSent = await sendEmail({
        to: normalizedEmail,
        subject: 'Your Admin Panel Verification Code',
        html: ADMIN_EMAIL_HTML(code),
      })
      const isDev = process.env.NODE_ENV === 'development'
      return NextResponse.json({
        success: true,
        message: 'Verification code sent to your email',
        ...(isDev || !emailSent ? { code } : {}),
      })
    }

    // Phone
    const phone = user.phone
    const normalized = phone ? normalizePhone(phone) : ''
    if (!normalized || normalized.length < 10) {
      return NextResponse.json(
        { error: 'No phone on profile. Add a phone in Profile or use email verification.' },
        { status: 400 }
      )
    }
    await storePhoneCode(phone!, code, 10)
    let smsSent = false
    if (isAzureSmsConfigured()) {
      smsSent = await sendAzureSms(normalized, SMS_MESSAGE(code))
    }
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json({
      success: true,
      message: smsSent ? 'Verification code sent to your phone' : 'Code generated; SMS may not be configured.',
      ...(isDev || !smsSent ? { code } : {}),
    })
  } catch (e) {
    console.error('Admin send-verification error:', e)
    return NextResponse.json({ error: 'Failed to send verification code' }, { status: 500 })
  }
}
