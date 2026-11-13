import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'
import { isAzureEmailConfigured, sendEmail, generateVerificationEmail } from '@/lib/email'

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
    
    if (!isAzureEmailConfigured()) {
      return NextResponse.json({
        error: 'Email service not configured. Please contact support or try again later.',
        success: false,
        smtpConfigured: !!process.env.SMTP_HOST,
      }, { status: 503 })
    }

    // Queue verification email — ACS accept/poll must not block the UI "Sending…" state.
    const userName = user.name || user.username || 'User'
    const emailHtml = generateVerificationEmail(userName, verificationUrl)
    void sendEmail({
      to: user.email,
      subject: 'Verify your AI Media Tank (AMT) account',
      html: emailHtml,
      waitUntilDelivered: false,
    }).then((ok) => {
      console.log('[send-verification] Background email result for', user.email, ok)
    })

    if (process.env.NODE_ENV === 'development') {
      console.log(`Dev only — verification URL: ${verificationUrl}`)
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


