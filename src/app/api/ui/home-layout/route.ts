import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const LAYOUTS = ['masonry', 'grid'] as const
export type HomeLayoutType = (typeof LAYOUTS)[number]

async function getOrCreateSetting(): Promise<{ layout: HomeLayoutType; preplay: boolean; ecardEnabled: boolean }> {
  let row = await prisma.homeLayoutSetting.findFirst()
  if (!row) {
    row = await prisma.homeLayoutSetting.create({
      data: { layout: 'masonry' },
    })
  }
  const layout = row.layout as string
  const layoutVal = LAYOUTS.includes(layout as HomeLayoutType) ? (layout as HomeLayoutType) : 'masonry'
  const ecardEnabled = row.ecardEnabled ?? true
  return { layout: layoutVal, preplay: row.preplay, ecardEnabled }
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
