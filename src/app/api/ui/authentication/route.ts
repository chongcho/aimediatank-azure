import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function getOrCreateSetting(): Promise<{
  emailVerificationEnabled: boolean
  phoneVerificationEnabled: boolean
}> {
  let row = await prisma.mediaDetailSetting.findFirst()
  if (!row) {
    row = await prisma.mediaDetailSetting.create({ data: {} })
  }
  const raw = (row as { shareAppsEnabled?: unknown }).shareAppsEnabled
  const auth =
    raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).__auth &&
    typeof (raw as Record<string, unknown>).__auth === 'object' &&
    !Array.isArray((raw as Record<string, unknown>).__auth)
      ? ((raw as Record<string, unknown>).__auth as Record<string, unknown>)
      : null
  return {
    emailVerificationEnabled: auth?.emailVerificationEnabled !== false,
    phoneVerificationEnabled: auth?.phoneVerificationEnabled !== false,
  }
}

export async function GET() {
  try {
    const { emailVerificationEnabled, phoneVerificationEnabled } = await getOrCreateSetting()
    return NextResponse.json({ emailVerificationEnabled, phoneVerificationEnabled })
  } catch (error) {
    console.error('Authentication settings unavailable:', error)
    return NextResponse.json({
      emailVerificationEnabled: true,
      phoneVerificationEnabled: true,
    })
  }
}
