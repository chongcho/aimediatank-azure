import type { Prisma } from '@prisma/client'

/**
 * Same readiness rule as GET /api/media for the public home feed (when includeProcessing is off):
 * show when transcoding is done, or still "processing" but a variant URL is already in `media.url`
 * (360p–1080p / hq) so the card can play on the home page.
 */
export const publicHomeFeedMediaReadyClause: Prisma.MediaWhereInput = {
  OR: [
    { processingStatus: 'completed' },
    { processingStatus: 'processing', url: { contains: '-360p', mode: 'insensitive' } },
    { processingStatus: 'processing', url: { contains: '-480p', mode: 'insensitive' } },
    { processingStatus: 'processing', url: { contains: '-720p', mode: 'insensitive' } },
    { processingStatus: 'processing', url: { contains: '-1080p', mode: 'insensitive' } },
    { processingStatus: 'processing', url: { contains: '-hq.mp4', mode: 'insensitive' } },
  ],
}

/** Public, approved, non-deleted, and "ready" for the default home listing. */
export function wherePublicHomeFeedVisible(): Prisma.MediaWhereInput {
  return {
    isPublic: true,
    isApproved: true,
    isDeleted: false,
    AND: [publicHomeFeedMediaReadyClause],
  }
}
