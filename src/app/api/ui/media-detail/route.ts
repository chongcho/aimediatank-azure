import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export const DEFAULT_SHARE_APPS: Record<string, boolean> = {
  email: true,
  whatsapp: true,
  kakao: true,
  facebook: true,
  x: true,
  linkedin: true,
  reddit: true,
  youtube: true,
  tiktok: true,
}

export function normalizeShareAppsEnabled(raw: unknown): Record<string, boolean> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out = { ...DEFAULT_SHARE_APPS }
    for (const key of Object.keys(DEFAULT_SHARE_APPS)) {
      const v = (raw as Record<string, unknown>)[key]
      if (typeof v === 'boolean') out[key] = v
    }
    return out
  }
  return { ...DEFAULT_SHARE_APPS }
}

async function getOrCreateSetting(): Promise<{
  downloadEnabled: boolean
  shareEnabled: boolean
  sendByEmailEnabled: boolean
  shareAppsEnabled: Record<string, boolean>
}> {
  let row = await prisma.mediaDetailSetting.findFirst()
  if (!row) {
    row = await prisma.mediaDetailSetting.create({
      data: {},
    })
  }
  const shareAppsRaw = (row as { shareAppsEnabled?: unknown }).shareAppsEnabled
  return {
    downloadEnabled: row.downloadEnabled ?? true,
    shareEnabled: row.shareEnabled ?? true,
    sendByEmailEnabled: row.sendByEmailEnabled ?? true,
    shareAppsEnabled: normalizeShareAppsEnabled(shareAppsRaw),
  }
}

export async function GET() {
  try {
    const { downloadEnabled, shareEnabled, sendByEmailEnabled, shareAppsEnabled } = await getOrCreateSetting()
    return NextResponse.json({ downloadEnabled, shareEnabled, sendByEmailEnabled, shareAppsEnabled })
  } catch (error) {
    console.error('Media detail settings unavailable:', error)
    return NextResponse.json({
      downloadEnabled: true,
      shareEnabled: true,
      sendByEmailEnabled: true,
      shareAppsEnabled: { ...DEFAULT_SHARE_APPS },
    })
  }
}
