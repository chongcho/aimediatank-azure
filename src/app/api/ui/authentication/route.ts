import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFirstMediaDetailSetting } from '@/lib/mediaDetailSetting'
import { normalizeAgeRequirement, type AgeRequirement } from '@/lib/birthday'

export const dynamic = 'force-dynamic'

async function getOrCreateSetting(): Promise<{
  emailVerificationEnabled: boolean
  phoneVerificationEnabled: boolean
  selfServiceDeactivateAccountEnabled: boolean
  ageRequirement: AgeRequirement
}> {
  let row = await getFirstMediaDetailSetting()
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
    selfServiceDeactivateAccountEnabled: auth?.selfServiceDeactivateAccountEnabled !== false,
    ageRequirement: normalizeAgeRequirement(auth?.ageRequirement),
  }
}

export async function GET() {
  try {
    const settings = await getOrCreateSetting()
    return NextResponse.json(settings)
  } catch (error) {
    console.error('Authentication settings unavailable:', error)
    return NextResponse.json({
      emailVerificationEnabled: true,
      phoneVerificationEnabled: true,
      selfServiceDeactivateAccountEnabled: true,
      ageRequirement: 13,
    })
  }
}
