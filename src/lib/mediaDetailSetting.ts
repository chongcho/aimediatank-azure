import { prisma } from '@/lib/prisma'

/** Prefer the row most recently written so reads match admin updates if duplicates ever exist. */
export async function getFirstMediaDetailSetting() {
  return prisma.mediaDetailSetting.findFirst({
    orderBy: { updatedAt: 'desc' },
  })
}
