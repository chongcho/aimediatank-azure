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
  { itemKey: 'chat', label: 'Gong', isEnabled: true, sortOrder: 6 },
  { itemKey: 'mediaMessage', label: 'Celebration Card', isEnabled: true, sortOrder: 7 },
  { itemKey: 'upload', label: 'Post', isEnabled: true, sortOrder: 8 },
  { itemKey: 'cropTool', label: 'Crop Tool', isEnabled: true, sortOrder: 9 },
  { itemKey: 'signIn', label: 'Log in', isEnabled: true, sortOrder: 10 },
  { itemKey: 'signUp', label: 'Join', isEnabled: true, sortOrder: 11 },
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

        // One-time migration for legacy deployments:
        // Older DBs created `signIn` with sortOrder=9. When `cropTool` is added later as a
        // missing item (also defaulting to sortOrder=9) and we intentionally do NOT
        // overwrite existing sortOrders, this creates a collision and non-deterministic ordering.
        //
        // If we detect the legacy default sequence (signIn=9, signUp=10, notification=11)
        // we shift those three up by +1 before inserting the missing `cropTool`.
        const missingKeys = new Set(missingItems.map((i) => i.itemKey))
        const cropToolMissing = missingKeys.has('cropTool')
        const signInItem = items.find((i) => i.itemKey === 'signIn')
        const signUpItem = items.find((i) => i.itemKey === 'signUp')
        const notificationItem = items.find((i) => i.itemKey === 'notification')

        const legacySequenceMatches =
          cropToolMissing &&
          signInItem?.sortOrder === 9 &&
          signUpItem?.sortOrder === 10 &&
          notificationItem?.sortOrder === 11 &&
          items.every((i) => i.sortOrder !== 9 || i.itemKey === 'signIn') &&
          items.every((i) => i.sortOrder !== 10 || i.itemKey === 'signUp') &&
          items.every((i) => i.sortOrder !== 11 || i.itemKey === 'notification')

        if (legacySequenceMatches) {
          await prisma.navbarMenuSetting.update({
            where: { id: signInItem!.id },
            data: { sortOrder: 10 },
          })
          await prisma.navbarMenuSetting.update({
            where: { id: signUpItem!.id },
            data: { sortOrder: 11 },
          })
          await prisma.navbarMenuSetting.update({
            where: { id: notificationItem!.id },
            data: { sortOrder: 12 },
          })
        }

        for (const item of missingItems) {
          await prisma.navbarMenuSetting.create({ data: item })
        }
        const defaultByKey = new Map(defaultItems.map((d) => [d.itemKey, d]))
        for (const item of items) {
          const expected = defaultByKey.get(item.itemKey)
          if (!expected) continue
          // Preserve admin/custom ordering: only sync labels (and only for existing items).
          // sortOrder is user-controlled and should not be overwritten on every GET.
          if (item.label !== expected.label) {
            await prisma.navbarMenuSetting.update({
              where: { id: item.id },
              data: { label: expected.label },
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

