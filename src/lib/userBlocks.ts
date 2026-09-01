import { prisma } from '@/lib/prisma'

export async function getBlockedUserIdsForViewer(viewerId: string | null | undefined): Promise<string[]> {
  if (!viewerId) return []
  const rows = await prisma.userBlock.findMany({
    where: { blockerId: viewerId },
    select: { blockedId: true },
  })
  return rows.map((row) => row.blockedId)
}

export async function isUserBlocked(blockerId: string, blockedId: string): Promise<boolean> {
  if (blockerId === blockedId) return false
  const row = await prisma.userBlock.findUnique({
    where: { blockerId_blockedId: { blockerId, blockedId } },
    select: { id: true },
  })
  return Boolean(row)
}
