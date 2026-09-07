import { prisma } from '@/lib/prisma'

export async function getBlockedMediaIdsForViewer(
  viewerId: string | null | undefined,
): Promise<string[]> {
  if (!viewerId) return []
  const rows = await prisma.mediaBlock.findMany({
    where: { blockerId: viewerId },
    select: { mediaId: true },
  })
  return rows.map((row) => row.mediaId)
}

export async function isMediaBlocked(blockerId: string, mediaId: string): Promise<boolean> {
  const row = await prisma.mediaBlock.findUnique({
    where: { blockerId_mediaId: { blockerId, mediaId } },
    select: { id: true },
  })
  return Boolean(row)
}
