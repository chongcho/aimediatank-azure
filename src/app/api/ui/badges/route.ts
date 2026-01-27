import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const defaultItems = [
  { itemKey: 'ai', label: 'AI', isEnabled: true, sortOrder: 0 },
  { itemKey: 'price', label: 'Price', isEnabled: true, sortOrder: 1 },
  { itemKey: 'sold', label: 'Times Sold', isEnabled: true, sortOrder: 2 },
  { itemKey: 'views', label: 'View', isEnabled: true, sortOrder: 3 },
  { itemKey: 'postDate', label: 'Post Date', isEnabled: true, sortOrder: 4 },
  { itemKey: 'smileRate', label: 'Smile Rate', isEnabled: true, sortOrder: 5 },
]

export async function GET() {
  try {
    try {
      let items = await prisma.mediaBadgeSetting.findMany({
        orderBy: { sortOrder: 'asc' },
      })

      if (items.length === 0) {
        for (const item of defaultItems) {
          await prisma.mediaBadgeSetting.create({ data: item })
        }
      } else {
        const existingKeys = new Set(items.map((item) => item.itemKey))
        const missingItems = defaultItems.filter((item) => !existingKeys.has(item.itemKey))
        for (const item of missingItems) {
          await prisma.mediaBadgeSetting.create({ data: item })
        }
      }

      items = await prisma.mediaBadgeSetting.findMany({
        orderBy: { sortOrder: 'asc' },
      })

      return NextResponse.json({ items })
    } catch (error) {
      console.error('Badge settings unavailable, returning defaults:', error)
      return NextResponse.json({
        items: defaultItems,
        warning: 'MEDIA_BADGE_SETTINGS_UNAVAILABLE',
      })
    }
  } catch (error) {
    console.error('Error fetching badge settings:', error)
    return NextResponse.json({ error: 'Failed to fetch badge settings' }, { status: 500 })
  }
}
