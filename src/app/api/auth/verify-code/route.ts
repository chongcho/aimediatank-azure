import { NextResponse } from 'next/server'
import { getStoredCode, deleteCode, markEmailVerified } from '@/lib/verificationStore'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json()

    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and code are required' },
        { status: 400 }
      )
    }

    // Get stored code
    const stored = getStoredCode(email)

    if (!stored) {
      return NextResponse.json({
        verified: false,
        error: 'No verification code found. Please request a new code.',
      })
    }

    if (Date.now() > stored.expires) {
      deleteCode(email)
      return NextResponse.json({
        verified: false,
        error: 'Verification code has expired. Please request a new code.',
      })
    }

    if (stored.code !== code) {
      return NextResponse.json({
        verified: false,
        error: 'Invalid verification code. Please try again.',
      })
    }

    // Code is valid - remove it and mark email as verified
    deleteCode(email)
    markEmailVerified(email, 30) // Valid for 30 minutes for registration

    return NextResponse.json({
      verified: true,
      message: 'Email verified successfully',
    })
  } catch (error) {
    console.error('Error verifying code:', error)
    return NextResponse.json(
      { error: 'Failed to verify code' },
      { status: 500 }
    )
  }
}
