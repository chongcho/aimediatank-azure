import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getFirstHomeLayoutSetting } from '@/lib/homeLayoutSetting'

export const dynamic = 'force-dynamic'

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
} as const

const defaultItems = [
  { itemKey: 'ai', label: 'AI', isEnabled: true, sortOrder: 0 },
  { itemKey: 'price', label: 'Price', isEnabled: true, sortOrder: 1 },
  { itemKey: 'sold', label: 'Times Sold', isEnabled: true, sortOrder: 2 },
  { itemKey: 'views', label: 'View', isEnabled: true, sortOrder: 3 },
  { itemKey: 'postDate', label: 'Post Date', isEnabled: true, sortOrder: 4 },
  { itemKey: 'smileRate', label: 'Thumbsup', isEnabled: true, sortOrder: 5 },
  { itemKey: 'comment', label: 'Comment', isEnabled: true, sortOrder: 6 },
  {
    itemKey: 'descriptionThumbnails',
    label: 'Description thumbnails',
    isEnabled: true,
    sortOrder: 7,
  },
  { itemKey: 'share', label: 'Share', isEnabled: true, sortOrder: 8 },
  { itemKey: 'mediaType', label: 'Media type', isEnabled: true, sortOrder: 9 },
  { itemKey: 'feedChat', label: 'Chat', isEnabled: true, sortOrder: 10 },
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

      let homePreplaySound = true
      let autoTranslation = true
      try {
        const layoutRow = await getFirstHomeLayoutSetting()
        if (layoutRow) {
          homePreplaySound = layoutRow.homePreplaySound !== false
          autoTranslation = layoutRow.autoTranslation !== false
        }
      } catch {
        /* column missing / DB error — default visible */
      }

      const renamed = await prisma.mediaBadgeSetting.updateMany({
        where: {
          itemKey: 'smileRate',
          label: { in: ['Smile Rate', 'Likes'] },
        },
        data: { label: 'Thumbsup' },
      })
      if (renamed.count > 0) {
        items = await prisma.mediaBadgeSetting.findMany({
          orderBy: { sortOrder: 'asc' },
        })
      }

      // Not a tile badge — controlled via HomeLayoutSetting + dedicated admin card only.
      items = items.filter((i) => i.itemKey !== 'homePreplaySound')

      return NextResponse.json({ items, homePreplaySound, autoTranslation }, { headers: NO_STORE_HEADERS })
    } catch (error) {
      console.error('Badge settings unavailable, returning defaults:', error)
      return NextResponse.json(
        {
          items: defaultItems,
          homePreplaySound: true,
          autoTranslation: true,
          warning: 'MEDIA_BADGE_SETTINGS_UNAVAILABLE',
        },
        { headers: NO_STORE_HEADERS }
      )
    }
  } catch (error) {
    console.error('Error fetching badge settings:', error)
    return NextResponse.json({ error: 'Failed to fetch badge settings' }, { status: 500 })
  }
}
