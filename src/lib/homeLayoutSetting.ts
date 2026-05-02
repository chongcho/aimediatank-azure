import { prisma } from '@/lib/prisma'

/** Prefer the row most recently written so reads match admin updates if duplicates ever exist. */
export async function getFirstHomeLayoutSetting() {
  return prisma.homeLayoutSetting.findFirst({
    orderBy: { updatedAt: 'desc' },
  })
}
