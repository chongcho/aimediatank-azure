import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Verify the reset code (without consuming it - that happens on password reset)
export async function POST(request: Request) {
  try {
    const { email, code } = await request.json()

    if (!email || !code) {
      return NextResponse.json(
        { valid: false, error: 'Email and code are required' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase()

    // Check if code exists in database
    const storedData = await prisma.verificationCode.findUnique({
      where: { email: normalizedEmail },
    })

    if (!storedData) {
      return NextResponse.json(
        { valid: false, error: 'No reset code found. Please request a new code.' },
        { status: 400 }
      )
    }

    // Check if code expired
    if (new Date() > storedData.expiresAt) {
      // Delete expired code
      await prisma.verificationCode.delete({
        where: { email: normalizedEmail },
      })
      return NextResponse.json(
        { valid: false, error: 'Reset code has expired. Please request a new code.' },
        { status: 400 }
      )
    }

    // Check if code matches
    if (storedData.code !== code) {
      return NextResponse.json(
        { valid: false, error: 'Invalid reset code. Please try again.' },
        { status: 400 }
      )
    }

    // Code is valid - don't delete it yet, wait for password reset
    return NextResponse.json({
      valid: true,
      message: 'Code verified successfully',
    })
  } catch (error) {
    console.error('Error verifying reset code:', error)
    return NextResponse.json(
      { valid: false, error: 'Failed to verify code' },
      { status: 500 }
    )
  }
}

