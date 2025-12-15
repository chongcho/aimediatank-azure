import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Import the verification codes map from send-code
// Note: In production, use Redis or database for persistence across instances
import { verificationCodes } from '../send-code/route'

// Verify the code
export async function POST(request: Request) {
  try {
    const { email, code } = await request.json()

    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and code are required' },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase()
    const storedData = verificationCodes.get(normalizedEmail)

    if (!storedData) {
      return NextResponse.json(
        { verified: false, error: 'No verification code found. Please request a new code.' },
        { status: 400 }
      )
    }

    // Check if code expired
    if (Date.now() > storedData.expires) {
      verificationCodes.delete(normalizedEmail)
      return NextResponse.json(
        { verified: false, error: 'Verification code has expired. Please request a new code.' },
        { status: 400 }
      )
    }

    // Check if code matches
    if (storedData.code !== code) {
      return NextResponse.json(
        { verified: false, error: 'Invalid verification code. Please try again.' },
        { status: 400 }
      )
    }

    // Code is valid - remove it from storage
    verificationCodes.delete(normalizedEmail)

    return NextResponse.json({
      verified: true,
      message: 'Email verified successfully',
    })
  } catch (error) {
    console.error('Error verifying code:', error)
    return NextResponse.json(
      { verified: false, error: 'Failed to verify code' },
      { status: 500 }
    )
  }
}
