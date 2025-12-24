import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { generateCode, storeCode } from '@/lib/verificationCodes'

export const dynamic = 'force-dynamic'

// Send verification code to email
export async function POST(request: Request) {
  try {
    const { email: rawEmail } = await request.json()

    if (!rawEmail) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(rawEmail)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    // Normalize email to lowercase
    const email = rawEmail.toLowerCase()

    // Generate and store 6-digit code
    const code = generateCode()
    await storeCode(email, code, 10) // 10 minutes expiry

    // Send email with code
    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">🔐 Email Verification Code</h1>
  </div>
  
  <p style="font-size: 16px;">Hello,</p>
  
  <p style="font-size: 16px;">Your verification code for AI Media Tank is:</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <div style="display: inline-block; background: #f8f9fa; padding: 20px 40px; border-radius: 12px; border: 2px dashed #0f8;">
      <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: monospace; color: #1a1a2e;">${code}</span>
    </div>
  </div>
  
  <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
    <p style="margin: 0; font-size: 14px; color: #856404;">
      ⏰ This code will expire in <strong>10 minutes</strong>.
    </p>
  </div>
  
  <p style="font-size: 14px; color: #666;">If you didn't request this code, you can safely ignore this email.</p>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
`

    const emailSent = await sendEmail({
      to: email,
      subject: 'Your AI Media Tank Verification Code',
      html: emailHtml,
    })

    // Return success (include code in dev mode for testing)
    const isDev = process.env.NODE_ENV === 'development'
    
    return NextResponse.json({
      success: true,
      message: 'Verification code sent',
      ...(isDev || !emailSent ? { code } : {}), // Show code if email failed or in dev
    })
  } catch (error) {
    console.error('Error sending verification code:', error)
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 500 }
    )
  }
}
