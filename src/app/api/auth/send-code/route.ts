import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { generateCode, storeCode } from '@/lib/verificationStore'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Generate and store verification code
    const code = generateCode()
    storeCode(email, code, 10) // Valid for 10 minutes

    // Send email with the code
    const emailSent = await sendEmail({
      to: email,
      subject: 'Your AI Media Tank Verification Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
            <h1 style="color: #0f8; margin: 0; font-size: 24px;">🔐 Verification Code</h1>
          </div>
          
          <p style="font-size: 16px;">Your verification code for AI Media Tank is:</p>
          
          <div style="background: #f8f9fa; padding: 30px; border-radius: 12px; text-align: center; margin: 20px 0;">
            <p style="font-size: 40px; font-family: monospace; font-weight: bold; letter-spacing: 8px; margin: 0; color: #1a1a2e;">
              ${code}
            </p>
          </div>
          
          <p style="font-size: 14px; color: #666;">
            This code will expire in <strong>10 minutes</strong>.
          </p>
          
          <p style="font-size: 14px; color: #666;">
            If you didn't request this code, you can safely ignore this email.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          
          <p style="font-size: 14px; color: #666;">
            Sincerely,<br>
            <strong>AI Media Tank Team</strong>
          </p>
        </body>
        </html>
      `,
    })

    // Return success (include code in dev mode for testing)
    const response: { success: boolean; message: string; code?: string } = {
      success: true,
      message: 'Verification code sent',
    }

    // Include code in development for testing
    if (process.env.NODE_ENV !== 'production' || !emailSent) {
      response.code = code
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error sending verification code:', error)
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 500 }
    )
  }
}
