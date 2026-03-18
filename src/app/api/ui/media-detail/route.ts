import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DEFAULT_SHARE_APPS, normalizeShareAppsEnabled } from './shareAppsConfig'

export const dynamic = 'force-dynamic'

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
