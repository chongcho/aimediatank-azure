// Database-backed verification codes storage
// Persists across serverless instances

import { prisma } from './prisma'

// Generate a 6-digit code
export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Store a verification code in database
export async function storeCode(email: string, code: string, expiresInMinutes: number = 10): Promise<void> {
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000)
  const normalizedEmail = email.toLowerCase()

  // Upsert: create or update existing code for this email
  await prisma.verificationCode.upsert({
    where: { email: normalizedEmail },
    update: { code, expiresAt },
    create: { email: normalizedEmail, code, expiresAt },
  })
}

// Verify and consume a code
export async function verifyCode(email: string, code: string): Promise<{ valid: boolean; error?: string }> {
  const normalizedEmail = email.toLowerCase()

  try {
    const storedData = await prisma.verificationCode.findUnique({
      where: { email: normalizedEmail },
    })

    if (!storedData) {
      return { valid: false, error: 'No verification code found. Please request a new code.' }
    }

    // Check if code expired
    if (new Date() > storedData.expiresAt) {
      // Delete expired code
      await prisma.verificationCode.delete({
        where: { email: normalizedEmail },
      })
      return { valid: false, error: 'Verification code has expired. Please request a new code.' }
    }

    // Check if code matches
    if (storedData.code !== code) {
      return { valid: false, error: 'Invalid verification code. Please try again.' }
    }

    // Code is valid - remove it from storage
    await prisma.verificationCode.delete({
      where: { email: normalizedEmail },
    })

    return { valid: true }
  } catch (error) {
    console.error('Error verifying code:', error)
    return { valid: false, error: 'Failed to verify code. Please try again.' }
  }
}

// Clean up expired codes (can be called periodically)
export async function cleanupExpiredCodes(): Promise<void> {
  await prisma.verificationCode.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  })
}
