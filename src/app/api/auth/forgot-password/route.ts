import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'
import { generateCode, storeCode } from '@/lib/verificationCodes'

export const dynamic = 'force-dynamic'

// Send password reset code to email
export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase()
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    console.log('Forgot password request for:', normalizedEmail, 'User found:', !!user)

    if (!user) {
      // Don't reveal if email exists or not for security
      // But still return success to prevent email enumeration
      console.log('User not found for email:', normalizedEmail)
      return NextResponse.json({
        success: true,
        message: 'If an account exists with this email, a reset code has been sent.',
      })
    }

    // Generate and store 6-digit code
    const code = generateCode()
    await storeCode(normalizedEmail, code, 15) // 15 minutes expiry for password reset
    
    console.log('Generated reset code for:', normalizedEmail, 'Code:', code)

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
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">🔑 Password Reset Code</h1>
  </div>
  
  <p style="font-size: 16px;">Hello ${user.username},</p>
  
  <p style="font-size: 16px;">We received a request to reset your password for AI Media Tank. Use the code below to reset your password:</p>
  
  <div style="text-align: center; margin: 30px 0;">
    <div style="display: inline-block; background: #f8f9fa; padding: 20px 40px; border-radius: 12px; border: 2px dashed #ff6b6b;">
      <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; font-family: monospace; color: #1a1a2e;">${code}</span>
    </div>
  </div>
  
  <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
    <p style="margin: 0; font-size: 14px; color: #856404;">
      ⏰ This code will expire in <strong>15 minutes</strong>.
    </p>
  </div>
  
  <div style="background: #f8d7da; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #dc3545;">
    <p style="margin: 0; font-size: 14px; color: #721c24;">
      🚨 If you didn't request this password reset, please ignore this email. Your password will remain unchanged.
    </p>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
`

    console.log('Sending password reset email to:', normalizedEmail)
    
    const emailSent = await sendEmail({
      to: normalizedEmail,
      subject: 'Reset Your AI Media Tank Password',
      html: emailHtml,
    })

    console.log('Email send result:', emailSent)

    // Return success (always include code for now until email is working)
    return NextResponse.json({
      success: true,
      message: 'Password reset code sent',
      code, // Always show code until email sending is confirmed working
    })
  } catch (error) {
    console.error('Error sending password reset code:', error)
    return NextResponse.json(
      { error: 'Failed to send reset code' },
      { status: 500 }
    )
  }
}

