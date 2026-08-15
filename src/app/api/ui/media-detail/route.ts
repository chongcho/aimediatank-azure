import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFirstMediaDetailSetting } from '@/lib/mediaDetailSetting'
import { DEFAULT_SHARE_APPS, normalizeShareAppsEnabled } from './shareAppsConfig'

export const dynamic = 'force-dynamic'

async function getOrCreateSetting(): Promise<{
  downloadEnabled: boolean
  shareEnabled: boolean
  sendByEmailEnabled: boolean
  cardEnabled: boolean
  aiToolEnabled: boolean
  shareAppsEnabled: Record<string, boolean>
}> {
  let row = await getFirstMediaDetailSetting()
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
    cardEnabled: row.cardEnabled ?? true,
    aiToolEnabled: row.aiToolEnabled ?? true,
    shareAppsEnabled: normalizeShareAppsEnabled(shareAppsRaw),
  }
}

export async function GET() {
  try {
    const { downloadEnabled, shareEnabled, sendByEmailEnabled, cardEnabled, aiToolEnabled, shareAppsEnabled } =
      await getOrCreateSetting()
    return NextResponse.json({ downloadEnabled, shareEnabled, sendByEmailEnabled, cardEnabled, aiToolEnabled, shareAppsEnabled })
  } catch (error) {
    console.error('Media detail settings unavailable:', error)
    return NextResponse.json({
      downloadEnabled: true,
      shareEnabled: true,
      sendByEmailEnabled: true,
      cardEnabled: true,
      aiToolEnabled: true,
      shareAppsEnabled: { ...DEFAULT_SHARE_APPS },
    })
  }
}
