import { NextResponse } from 'next/server'
import { verifyPhoneCode } from '@/lib/phoneVerificationCodes'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const { phone, code } = await request.json()

    if (!phone || !code) {
      return NextResponse.json(
        { error: 'Phone and verification code are required' },
        { status: 400 }
      )
    }

    const result = await verifyPhoneCode(phone, code.trim())

    if (!result.valid) {
      return NextResponse.json(
        { valid: false, error: result.error },
        { status: 400 }
      )
    }

    return NextResponse.json({ valid: true })
  } catch (error) {
    console.error('Error verifying phone code:', error)
    return NextResponse.json(
      { error: 'Failed to verify code' },
      { status: 500 }
    )
  }
}
