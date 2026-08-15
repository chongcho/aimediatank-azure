import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateCode, storeCode } from '@/lib/verificationCodes'
import { storePhoneCode, normalizePhone } from '@/lib/phoneVerificationCodes'
import { sendEmail } from '@/lib/email'
import { isAzureSmsConfigured, sendAzureSms } from '@/lib/azureSms'

export const dynamic = 'force-dynamic'

function emailHtml(title: string, bodyLead: string, code: string) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">🔐 ${title}</h1>
  </div>
  <p style="font-size: 16px;">${bodyLead}</p>
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
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user || (session.user as { role?: string }).role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const body = await request.json().catch(() => ({}))
    const channel = body?.channel === 'phone' ? 'phone' : 'email'
    const verifyMode =
      typeof body?.verifyMode === 'string' && body.verifyMode.trim() === 'adminUser' ? 'adminUser' : 'adminPanel'
    const isAccountStep2 = verifyMode === 'adminUser'
    const emailTitle = isAccountStep2 ? 'Admin Account Verification' : 'Admin Panel Verification'
    const emailLead = isAccountStep2
      ? 'Your verification code to finish Admin Account sign-in is:'
      : 'Your verification code to access the Admin Panel is:'
    const emailSubject = isAccountStep2
      ? 'Your Admin Account Verification Code'
      : 'Your Admin Panel Verification Code'
    const smsPrefix = isAccountStep2 ? 'Admin Account' : 'Admin Panel'

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
        subject: emailSubject,
        html: emailHtml(emailTitle, emailLead, code),
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
      smsSent = await sendAzureSms(
        normalized,
        `Your AI Media Tank (AMT) ${smsPrefix} verification code is: ${code}. It expires in 10 minutes.`
      )
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
