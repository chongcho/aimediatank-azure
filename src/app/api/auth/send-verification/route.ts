import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'
import { sendEmail, generateVerificationEmail } from '@/lib/email'

// Function to generate verification token
function generateVerificationToken() {
  return uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
}

// POST - Send/Resend verification email
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    let email: string | null = null

    // Check if user is logged in
    if (session?.user?.email) {
      email = session.user.email
    } else {
      // Get email from request body for non-logged in users
      const body = await request.json()
      email = body.email
    }

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    if (user.emailVerified) {
      return NextResponse.json(
        { error: 'Email is already verified' },
        { status: 400 }
      )
    }

    // Generate new verification token
    const verificationToken = generateVerificationToken()
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Update user with new token
    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken,
        verificationExpires,
      },
    })

    // Build verification URL
    const baseUrl = process.env.NEXTAUTH_URL || 'https://www.aimediatank.com'
    const verificationUrl = `${baseUrl}/verify-email?token=${verificationToken}`
    
    // Send verification email
    const userName = user.name || user.username || 'User'
    const emailHtml = generateVerificationEmail(userName, verificationUrl)
    
    const emailSent = await sendEmail({
      to: user.email,
      subject: 'Verify your AI Media Tank account',
      html: emailHtml,
    })

    console.log('='.repeat(60))
    console.log('VERIFICATION EMAIL')
    console.log('='.repeat(60))
    console.log(`To: ${user.email}`)
    console.log(`Email sent: ${emailSent}`)
    console.log(`Verification URL: ${verificationUrl}`)
    console.log(`SMTP_HOST configured: ${!!process.env.SMTP_HOST}`)
    console.log(`SMTP_USER configured: ${!!process.env.SMTP_USER}`)
    console.log(`SMTP_PASS configured: ${!!process.env.SMTP_PASS}`)
    console.log('='.repeat(60))

    if (!emailSent) {
      // Email failed to send - likely SMTP not configured
      return NextResponse.json({
        error: 'Email service not configured. Please contact support or try again later.',
        success: false,
        smtpConfigured: !!process.env.SMTP_HOST,
      }, { status: 503 })
    }

    return NextResponse.json({
      message: 'Verification email sent! Please check your inbox.',
      success: true,
    })
  } catch (error) {
    console.error('Error sending verification email:', error)
    return NextResponse.json(
      { error: 'Failed to send verification email' },
      { status: 500 }
    )
  }
}


