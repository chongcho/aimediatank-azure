import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getMaxUploadFileBytes } from '@/lib/uploadMaxFileSize'

export const dynamic = 'force-dynamic'

const defaultSettings = {
  isEnabled: true,
  imageQuality: 0.92, videoBitrateMbps: 8.0, videoFps: 30, audioBitrateKbps: 256,
  freeImageQuality: 0.75, freeVideoBitrateMbps: 4.0, freeVideoFps: 24, freeAudioBitrateKbps: 128,
  maxUploadSizeMb: 10,
}

export async function GET() {
  try {
    let settings = await prisma.cropToolSetting.findFirst()

    if (!settings) {
      settings = await prisma.cropToolSetting.create({ data: defaultSettings })
    }

    const maxUploadFileBytes = await getMaxUploadFileBytes()

    return NextResponse.json({ settings, maxUploadFileBytes })
  } catch (error) {
    console.error('Crop tool settings unavailable, returning defaults:', error)
    const fallbackBytes = defaultSettings.maxUploadSizeMb * 1024 * 1024
    return NextResponse.json({
      settings: defaultSettings,
      maxUploadFileBytes: fallbackBytes,
      warning: 'CROP_TOOL_SETTINGS_UNAVAILABLE',
    })
  }
}
