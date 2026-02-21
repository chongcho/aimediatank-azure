// Phone verification codes for two-step verification (sign up, etc.)
// Normalize phone to digits only for storage and lookup

import { prisma } from './prisma'

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function storePhoneCode(
  phone: string,
  code: string,
  expiresInMinutes: number = 10
): Promise<void> {
  const normalized = normalizePhone(phone)
  if (!normalized || normalized.length < 10) {
    throw new Error('Invalid phone number')
  }
  const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000)
  await prisma.phoneVerificationCode.upsert({
    where: { phone: normalized },
    update: { code, expiresAt },
    create: { phone: normalized, code, expiresAt },
  })
}

export async function verifyPhoneCode(
  phone: string,
  code: string
): Promise<{ valid: boolean; error?: string }> {
  const normalized = normalizePhone(phone)
  if (!normalized) {
    return { valid: false, error: 'Invalid phone number.' }
  }
  try {
    const row = await prisma.phoneVerificationCode.findUnique({
      where: { phone: normalized },
    })
    if (!row) {
      return { valid: false, error: 'No verification code found. Please request a new code.' }
    }
    if (new Date() > row.expiresAt) {
      await prisma.phoneVerificationCode.delete({ where: { phone: normalized } })
      return { valid: false, error: 'Verification code has expired. Please request a new code.' }
    }
    if (row.code !== code) {
      return { valid: false, error: 'Invalid verification code. Please try again.' }
    }
    await prisma.phoneVerificationCode.delete({ where: { phone: normalized } })
    return { valid: true }
  } catch (error) {
    console.error('Error verifying phone code:', error)
    return { valid: false, error: 'Failed to verify code. Please try again.' }
  }
}
