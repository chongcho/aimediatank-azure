import { NextResponse } from 'next/server'
import { verifyCode } from '@/lib/verificationCodes'

export const dynamic = 'force-dynamic'

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

    const result = verifyCode(email, code)

    if (!result.valid) {
      return NextResponse.json(
        { verified: false, error: result.error },
        { status: 400 }
      )
    }

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
