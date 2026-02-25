import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const LAYOUTS = ['masonry', 'grid_top', 'grid_center'] as const
export type HomeLayoutType = (typeof LAYOUTS)[number]

function normalizeLayout(raw: string): HomeLayoutType {
  if (LAYOUTS.includes(raw as HomeLayoutType)) return raw as HomeLayoutType
  if (raw === 'grid') return 'grid_center' // legacy
  return 'masonry'
}

async function getOrCreateSetting(): Promise<{ layout: HomeLayoutType; preplay: boolean; ecardEnabled: boolean }> {
  let row = await prisma.homeLayoutSetting.findFirst()
  if (!row) {
    row = await prisma.homeLayoutSetting.create({
      data: { layout: 'masonry' },
    })
  }
  const layoutVal = normalizeLayout(row.layout)
  const ecardEnabled = row.ecardEnabled ?? true
  return { layout: layoutVal, preplay: row.preplay, ecardEnabled: row.ecardEnabled ?? true }
}

export async function GET() {
  try {
    const { layout, preplay, ecardEnabled } = await getOrCreateSetting()
    return NextResponse.json({ layout, preplay, ecardEnabled })
  } catch (error) {
    console.error('Home layout settings unavailable:', error)
    return NextResponse.json({ layout: 'masonry', preplay: true, ecardEnabled: true })
  }
}
