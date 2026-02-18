import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function getOrCreateSetting(): Promise<{ downloadEnabled: boolean; shareEnabled: boolean; sendByEmailEnabled: boolean }> {
  let row = await prisma.mediaDetailSetting.findFirst()
  if (!row) {
    row = await prisma.mediaDetailSetting.create({
      data: {},
    })
  }
  return {
    downloadEnabled: row.downloadEnabled ?? true,
    shareEnabled: row.shareEnabled ?? true,
    sendByEmailEnabled: row.sendByEmailEnabled ?? true,
  }
}

export async function GET() {
  try {
    const { downloadEnabled, shareEnabled, sendByEmailEnabled } = await getOrCreateSetting()
    return NextResponse.json({ downloadEnabled, shareEnabled, sendByEmailEnabled })
  } catch (error) {
    console.error('Media detail settings unavailable:', error)
    return NextResponse.json({ downloadEnabled: true, shareEnabled: true, sendByEmailEnabled: true })
  }
}
