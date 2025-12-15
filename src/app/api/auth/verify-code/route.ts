import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// In-memory store for verification codes (shared with send-code)
// In production, use Redis or database
const verificationCodes = new Map<string, { code: string; expires: number }>()

// Also store verified emails temporarily
const verifiedEmails = new Map<string, number>()

export async function POST(request: Request) {
  try {
    const { email, code } = await request.json()

    if (!email || !code) {
      return NextResponse.json(
        { error: 'Email and code are required' },
        { status: 400 }
      )
    }

    const emailLower = email.toLowerCase()
    
    // Get stored code from send-code endpoint's map
    // Since we can't share state between serverless functions,
    // we'll use a simple verification that stores codes in a global
    const { verificationCodes: sendCodeMap } = await import('../send-code/route')
    const stored = sendCodeMap.get(emailLower)

    if (!stored) {
      return NextResponse.json({
        verified: false,
        error: 'No verification code found. Please request a new code.',
      })
    }

    if (Date.now() > stored.expires) {
      sendCodeMap.delete(emailLower)
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
    sendCodeMap.delete(emailLower)
    verifiedEmails.set(emailLower, Date.now() + 30 * 60 * 1000) // Valid for 30 minutes

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

// Check if email is verified (can be used by register endpoint)
export function isEmailVerified(email: string): boolean {
  const expires = verifiedEmails.get(email.toLowerCase())
  if (!expires) return false
  if (Date.now() > expires) {
    verifiedEmails.delete(email.toLowerCase())
    return false
  }
  return true
}

export { verifiedEmails }

