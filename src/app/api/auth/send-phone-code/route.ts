import { NextResponse } from 'next/server'
import { generateCode, storePhoneCode, normalizePhone } from '@/lib/phoneVerificationCodes'
import { isAzureSmsConfigured, sendAzureSms } from '@/lib/azureSms'

export const dynamic = 'force-dynamic'

// Azure ACS SMS: set AZURE_ACS_CONNECTION_STRING (or COMMUNICATION_SERVICES_CONNECTION_STRING)
// and AZURE_ACS_SMS_FROM (E.164 sender, e.g. +18005551234) in your Communication Services resource.

const SMS_MESSAGE = (code: string) =>
  `Your AI Media Tank verification code is: ${code}. It expires in 10 minutes.`

// Send 6-digit verification code to phone via Azure Communication Services (ACS) when configured.
// Otherwise return code in response for testing (dev or no SMS provider).
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

    const useAzureSms = isAzureSmsConfigured()
    let smsSent = false
    if (useAzureSms) {
      smsSent = await sendAzureSms(normalized, SMS_MESSAGE(code))
      if (!smsSent) {
        return NextResponse.json(
          { error: 'Failed to send SMS. Please try again or use a different number.' },
          { status: 502 }
        )
      }
    }

    const isDev = process.env.NODE_ENV === 'development'
    if (isDev && !smsSent) {
      console.log('[Phone verification] Code for', rawPhone, ':', code)
    }
    const includeCodeInResponse = !smsSent

    return NextResponse.json({
      success: true,
      message: smsSent ? 'Verification code sent to your phone' : 'Verification code generated (SMS not configured; use code below)',
      ...(includeCodeInResponse ? { code } : {}),
    })
  } catch (error) {
    console.error('Error sending phone verification code:', error)
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 500 }
    )
  }
}
