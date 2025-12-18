// Shared verification codes storage
// Note: In production, use Redis or database for persistence across instances

interface VerificationData {
  code: string
  expires: number
}

// Global Map to store verification codes
// This persists within the same server instance
declare global {
  // eslint-disable-next-line no-var
  var verificationCodes: Map<string, VerificationData> | undefined
}

// Use global to persist across module reloads in development
export const verificationCodes: Map<string, VerificationData> = 
  global.verificationCodes || new Map<string, VerificationData>()

if (process.env.NODE_ENV !== 'production') {
  global.verificationCodes = verificationCodes
}

// Generate a 6-digit code
export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Store a verification code
export function storeCode(email: string, code: string, expiresInMinutes: number = 10): void {
  const expires = Date.now() + expiresInMinutes * 60 * 1000
  verificationCodes.set(email.toLowerCase(), { code, expires })
}

// Verify and consume a code
export function verifyCode(email: string, code: string): { valid: boolean; error?: string } {
  const normalizedEmail = email.toLowerCase()
  const storedData = verificationCodes.get(normalizedEmail)

  if (!storedData) {
    return { valid: false, error: 'No verification code found. Please request a new code.' }
  }

  // Check if code expired
  if (Date.now() > storedData.expires) {
    verificationCodes.delete(normalizedEmail)
    return { valid: false, error: 'Verification code has expired. Please request a new code.' }
  }

  // Check if code matches
  if (storedData.code !== code) {
    return { valid: false, error: 'Invalid verification code. Please try again.' }
  }

  // Code is valid - remove it from storage
  verificationCodes.delete(normalizedEmail)
  return { valid: true }
}





