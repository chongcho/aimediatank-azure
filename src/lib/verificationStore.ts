// In-memory store for verification codes
// In production, use Redis or database for persistence across serverless instances

interface VerificationCode {
  code: string
  expires: number
}

// Store verification codes
const verificationCodes = new Map<string, VerificationCode>()

// Store verified emails (valid for registration)
const verifiedEmails = new Map<string, number>()

// Generate a 6-digit code
export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Store a verification code
export function storeCode(email: string, code: string, expiresInMinutes: number = 10): void {
  const expires = Date.now() + expiresInMinutes * 60 * 1000
  verificationCodes.set(email.toLowerCase(), { code, expires })
}

// Get stored code
export function getStoredCode(email: string): VerificationCode | undefined {
  return verificationCodes.get(email.toLowerCase())
}

// Delete code
export function deleteCode(email: string): void {
  verificationCodes.delete(email.toLowerCase())
}

// Mark email as verified
export function markEmailVerified(email: string, validForMinutes: number = 30): void {
  const expires = Date.now() + validForMinutes * 60 * 1000
  verifiedEmails.set(email.toLowerCase(), expires)
}

// Check if email is verified
export function isEmailVerified(email: string): boolean {
  const expires = verifiedEmails.get(email.toLowerCase())
  if (!expires) return false
  if (Date.now() > expires) {
    verifiedEmails.delete(email.toLowerCase())
    return false
  }
  return true
}

// Clear verified status
export function clearVerified(email: string): void {
  verifiedEmails.delete(email.toLowerCase())
}

