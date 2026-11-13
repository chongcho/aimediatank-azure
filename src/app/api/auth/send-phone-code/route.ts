import { NextResponse } from 'next/server'
import { generateCode, storePhoneCode, normalizePhone } from '@/lib/phoneVerificationCodes'
import { isAzureSmsConfigured, sendAzureSms } from '@/lib/azureSms'
import { maskPhoneForDisplay } from '@/lib/maskContact'

export const dynamic = 'force-dynamic'

// Azure ACS SMS: set AZURE_ACS_CONNECTION_STRING (or COMMUNICATION_SERVICES_CONNECTION_STRING)
// and AZURE_ACS_SMS_FROM (E.164, e.g. +18339081234) in your Communication Services resource.
// If no code is delivered: (1) Check server logs for [Azure SMS] and [send-phone-code]. (2) Ensure
// AZURE_ACS_SMS_FROM is an SMS-capable number; US toll-free may need toll-free verification in Azure Portal.

const SMS_MESSAGE = (code: string) =>
  `Your verification code is:\n${code}\nThis code expires in 10 minutes. If you didn't request it, secure your account.\nReply STOP to opt out.\nAI Media Tank`

// Send 6-digit verification code via Azure ACS. Never return the code to the client.
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const rawPhone = body?.phone

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

    const last4 = normalized.slice(-4)
    console.error('[send-phone-code] Request received, phone ends ***' + last4 + ', Azure SMS configured:', isAzureSmsConfigured())

    if (!isAzureSmsConfigured()) {
      console.warn('[send-phone-code] Azure SMS not configured (AZURE_ACS_CONNECTION_STRING, AZURE_ACS_SMS_FROM).')
      return NextResponse.json(
        { error: 'SMS is not configured. Please contact support or try again later.' },
        { status: 503 }
      )
    }

    const code = generateCode()
    await storePhoneCode(rawPhone, code, 10) // 10 minutes expiry

    if (process.env.NODE_ENV === 'development') {
      console.log('[send-phone-code] Dev only — code for ***' + last4 + ':', code)
    }

    // Respond immediately — ACS SMS latency must not leave the UI on "Sending…".
    void sendAzureSms(normalized, SMS_MESSAGE(code)).then((ok) => {
      console.error('[send-phone-code] Background SMS result for ***' + last4 + ':', ok ? 'ok' : 'failed')
    })

    const sentTo = maskPhoneForDisplay(normalized)
    return NextResponse.json({
      success: true,
      channel: 'phone',
      sentTo,
      message: `Sent to ${sentTo}`,
    })
  } catch (error) {
    console.error('Error sending phone verification code:', error)
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 500 }
    )
  }
}
