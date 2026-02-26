import { NextResponse } from 'next/server'
import { generateCode, storePhoneCode, normalizePhone } from '@/lib/phoneVerificationCodes'
import { isAzureSmsConfigured, sendAzureSms } from '@/lib/azureSms'

export const dynamic = 'force-dynamic'

// Azure ACS SMS: set AZURE_ACS_CONNECTION_STRING (or COMMUNICATION_SERVICES_CONNECTION_STRING)
// and AZURE_ACS_SMS_FROM (E.164, e.g. +18339081234) in your Communication Services resource.
// If no code is delivered: (1) Check server logs for [Azure SMS] and [send-phone-code]. (2) Ensure
// AZURE_ACS_SMS_FROM is an SMS-capable number; US toll-free may need toll-free verification in Azure Portal.

const SMS_MESSAGE = (code: string) =>
  `Your AI Media Tank verification code is: ${code}. It expires in 10 minutes.`

// Send 6-digit verification code to phone via Azure Communication Services (ACS) when configured.
// Otherwise return code in response for testing (dev or no SMS provider).
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

    // Log so App Service Log stream shows the request (enable Application Logging in Azure)
    const last4 = normalized.slice(-4)
    console.error('[send-phone-code] Request received, phone ends ***' + last4 + ', Azure SMS configured:', isAzureSmsConfigured())

    const code = generateCode()
    await storePhoneCode(rawPhone, code, 10) // 10 minutes expiry

    const useAzureSms = isAzureSmsConfigured()
    let smsSent = false
    if (useAzureSms) {
      smsSent = await sendAzureSms(normalized, SMS_MESSAGE(code))
      if (!smsSent) {
        // Log for debugging; return 502 so client shows error. In dev, include code so user can still verify.
        console.error('[send-phone-code] Azure SMS send failed for', rawPhone, '- check server logs for [Azure SMS] details')
        const isDev = process.env.NODE_ENV === 'development'
        return NextResponse.json(
          {
            error: 'SMS could not be delivered. Check that AZURE_ACS_SMS_FROM is an SMS-capable number (toll-free may require verification). Try again or use a different number.',
            ...(isDev ? { code } : {}),
          },
          { status: 502 }
        )
      }
    } else {
      console.warn('[send-phone-code] Azure SMS not configured (AZURE_ACS_CONNECTION_STRING, AZURE_ACS_SMS_FROM). Code stored but not sent.')
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
