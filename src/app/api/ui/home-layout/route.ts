import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFirstHomeLayoutSetting } from '@/lib/homeLayoutSetting'

export const dynamic = 'force-dynamic'

const LAYOUTS = ['masonry', 'grid_top', 'grid_center'] as const
export type HomeLayoutType = (typeof LAYOUTS)[number]

function normalizeLayout(raw: string): HomeLayoutType {
  if (LAYOUTS.includes(raw as HomeLayoutType)) return raw as HomeLayoutType
  if (raw === 'grid') return 'grid_center' // legacy
  return 'masonry'
}

async function getOrCreateSetting(): Promise<{
  layout: HomeLayoutType
  preplay: boolean
  homePreplaySound: boolean
  autoTranslation: boolean
}> {
  let row = await getFirstHomeLayoutSetting()
  if (!row) {
    row = await prisma.homeLayoutSetting.create({
      data: { layout: 'masonry' },
    })
  }
  const layoutVal = normalizeLayout(row.layout)
  return {
    layout: layoutVal,
    preplay: row.preplay,
    homePreplaySound: row.homePreplaySound !== false,
    autoTranslation: row.autoTranslation !== false,
  }
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
} as const

export async function GET() {
  try {
    const { layout, preplay, homePreplaySound, autoTranslation } = await getOrCreateSetting()
    return NextResponse.json({ layout, preplay, homePreplaySound, autoTranslation }, { headers: NO_STORE_HEADERS })
  } catch (error) {
    console.error('Home layout settings unavailable:', error)
    return NextResponse.json(
      { layout: 'masonry', preplay: true, homePreplaySound: true, autoTranslation: true },
      { headers: NO_STORE_HEADERS }
    )
  }
}
