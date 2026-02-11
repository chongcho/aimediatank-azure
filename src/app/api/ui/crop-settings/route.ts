import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const defaultSettings = {
  isEnabled: true,
  imageQuality: 0.92, videoBitrateMbps: 8.0, videoFps: 30, audioBitrateKbps: 256,
  freeImageQuality: 0.75, freeVideoBitrateMbps: 4.0, freeVideoFps: 24, freeAudioBitrateKbps: 128,
}

export async function GET() {
  try {
    let settings = await prisma.cropToolSetting.findFirst()

    if (!settings) {
      settings = await prisma.cropToolSetting.create({ data: defaultSettings })
    }

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Crop tool settings unavailable, returning defaults:', error)
    return NextResponse.json({
      settings: defaultSettings,
      warning: 'CROP_TOOL_SETTINGS_UNAVAILABLE',
    })
  }
}
