import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const defaultItems = [
  { itemKey: 'home', label: 'Home', isEnabled: true, sortOrder: 0 },
  { itemKey: 'all', label: 'All', isEnabled: true, sortOrder: 1 },
  { itemKey: 'videos', label: 'Videos', isEnabled: true, sortOrder: 2 },
  { itemKey: 'images', label: 'Images', isEnabled: true, sortOrder: 3 },
  { itemKey: 'about', label: 'About', isEnabled: true, sortOrder: 4 },
  { itemKey: 'play', label: 'Play', isEnabled: true, sortOrder: 5 },
  { itemKey: 'chat', label: 'Chat', isEnabled: true, sortOrder: 6 },
  { itemKey: 'mediaMessage', label: 'Celebration Card', isEnabled: true, sortOrder: 7 },
  { itemKey: 'upload', label: 'Post', isEnabled: true, sortOrder: 8 },
  { itemKey: 'cropTool', label: 'Crop Tool', isEnabled: true, sortOrder: 9 },
  { itemKey: 'signIn', label: 'Sign In', isEnabled: true, sortOrder: 10 },
  { itemKey: 'signUp', label: 'Sign Up', isEnabled: true, sortOrder: 11 },
  { itemKey: 'notification', label: 'Notification', isEnabled: true, sortOrder: 12 },
]

export async function GET() {
  try {
    try {
      let items = await prisma.navbarMenuSetting.findMany({
        orderBy: { sortOrder: 'asc' },
      })

      if (items.length === 0) {
        for (const item of defaultItems) {
          await prisma.navbarMenuSetting.create({ data: item })
        }
      } else {
        const existingKeys = new Set(items.map((item) => item.itemKey))
        const missingItems = defaultItems.filter((item) => !existingKeys.has(item.itemKey))
        for (const item of missingItems) {
          await prisma.navbarMenuSetting.create({ data: item })
        }
        const defaultByKey = new Map(defaultItems.map((d) => [d.itemKey, d]))
        for (const item of items) {
          const expected = defaultByKey.get(item.itemKey)
          if (!expected) continue
          if (item.label !== expected.label || item.sortOrder !== expected.sortOrder) {
            await prisma.navbarMenuSetting.update({
              where: { id: item.id },
              data: {
                label: expected.label,
                sortOrder: expected.sortOrder,
              },
            })
          }
        }
      }

      items = await prisma.navbarMenuSetting.findMany({
        orderBy: { sortOrder: 'asc' },
      })

      // Keep compatibility with older snapshots that had a marketing row.
      const filteredItems = items.filter((item) => item.itemKey !== 'marketing')
      return NextResponse.json({ items: filteredItems })
    } catch (error) {
      console.error('Navbar settings unavailable, returning defaults:', error)
      return NextResponse.json({ items: defaultItems, warning: 'NAVBAR_SETTINGS_UNAVAILABLE' })
    }
  } catch (error) {
    console.error('Error fetching navbar settings:', error)
    return NextResponse.json({ error: 'Failed to fetch navbar settings' }, { status: 500 })
  }
}

