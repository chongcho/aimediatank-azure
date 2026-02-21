import { NextResponse } from 'next/server'
import { generateCode, storePhoneCode, normalizePhone } from '@/lib/phoneVerificationCodes'

export const dynamic = 'force-dynamic'

// Send 6-digit verification code to phone (SMS).
// In production, integrate Twilio/AWS SNS etc. and send real SMS.
// In development, code is returned in response for testing.
export async function POST(request: Request) {
  try {
    const { phone: rawPhone } = await request.json()

    if (!rawPhone || typeof rawPhone !== 'string') {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }

    const normalized = normalizePhone(rawPhone)
    if (normalized.length < 10) {
      return NextResponse.json(
        { error: 'Please enter a valid phone number (at least 10 digits)' },
        { status: 400 }
      )
    }

    const code = generateCode()
    await storePhoneCode(rawPhone, code, 10) // 10 minutes expiry

    // TODO: Production – send SMS via Twilio/SNS using env TWILIO_* or similar
    const isDev = process.env.NODE_ENV === 'development'
    if (isDev) {
      console.log('[Phone verification] Code for', rawPhone, ':', code)
    }

    return NextResponse.json({
      success: true,
      message: 'Verification code sent',
      ...(isDev ? { code } : {}),
    })
  } catch (error) {
    console.error('Error sending phone verification code:', error)
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 500 }
    )
  }
}
