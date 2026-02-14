import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const LAYOUTS = ['masonry', 'grid'] as const
export type HomeLayoutType = (typeof LAYOUTS)[number]

async function getOrCreateSetting(): Promise<HomeLayoutType> {
  let row = await prisma.homeLayoutSetting.findFirst()
  if (!row) {
    row = await prisma.homeLayoutSetting.create({
      data: { layout: 'masonry' },
    })
  }
  const layout = row.layout as string
  return LAYOUTS.includes(layout as HomeLayoutType) ? (layout as HomeLayoutType) : 'masonry'
}

export async function GET() {
  try {
    const layout = await getOrCreateSetting()
    return NextResponse.json({ layout })
  } catch (error) {
    console.error('Home layout settings unavailable:', error)
    return NextResponse.json({ layout: 'masonry' })
  }
}
