import { prisma } from '@/lib/prisma'

/** Poster and admin cannot delete purchased media until this long after the latest purchase. */
export const PURCHASE_DELETE_LOCK_MS = 10 * 24 * 60 * 60 * 1000

export type PosterDeleteLock = {
  locked: boolean
  daysLeft: number | null
  unlockAt: string | null
  lastPurchaseAt: string | null
}

export function purchaseAnchor(purchase: { completedAt: Date | null; createdAt: Date }): Date {
  return purchase.completedAt ?? purchase.createdAt
}

export function posterMayDeleteAt(lastPurchaseAt: Date): Date {
  return new Date(lastPurchaseAt.getTime() + PURCHASE_DELETE_LOCK_MS)
}

export function wholeDaysUntil(target: Date, now = new Date()): number {
  return Math.ceil((target.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
}

export function lockFromLastPurchase(lastPurchaseAt: Date | null, now = new Date()): PosterDeleteLock {
  if (!lastPurchaseAt) {
    return { locked: false, daysLeft: null, unlockAt: null, lastPurchaseAt: null }
  }
  const unlockAt = posterMayDeleteAt(lastPurchaseAt)
  const locked = unlockAt.getTime() > now.getTime()
  return {
    locked,
    daysLeft: locked ? wholeDaysUntil(unlockAt, now) : 0,
    unlockAt: unlockAt.toISOString(),
    lastPurchaseAt: lastPurchaseAt.toISOString(),
  }
}

export function deleteLockMessage(lock: PosterDeleteLock): string {
  const days = lock.daysLeft ?? 0
  const dayLabel = days === 1 ? 'day' : 'days'
  return `This content cannot be deleted yet. The poster and an admin can delete it 10 days after the latest purchase (${days} ${dayLabel} left).`
}

export async function latestCompletedPurchaseAt(mediaId: string): Promise<Date | null> {
  const rows = await prisma.purchase.findMany({
    where: { mediaId, status: 'completed' },
    select: { completedAt: true, createdAt: true },
  })
  let last: Date | null = null
  for (const row of rows) {
    const at = purchaseAnchor(row)
    if (!last || at > last) last = at
  }
  return last
}

export async function getPosterDeleteLock(mediaId: string, now = new Date()): Promise<PosterDeleteLock> {
  return lockFromLastPurchase(await latestCompletedPurchaseAt(mediaId), now)
}

export async function activePurchaseDeleteLocksForOwner(userId: string, now = new Date()) {
  const purchases = await prisma.purchase.findMany({
    where: {
      status: 'completed',
      media: { userId, isDeleted: false },
    },
    select: {
      mediaId: true,
      completedAt: true,
      createdAt: true,
      media: { select: { title: true } },
    },
  })

  const lastByMedia = new Map<string, { at: Date; title: string }>()
  for (const row of purchases) {
    const at = purchaseAnchor(row)
    const prev = lastByMedia.get(row.mediaId)
    if (!prev || at > prev.at) {
      lastByMedia.set(row.mediaId, { at, title: row.media.title })
    }
  }

  const locked = []
  for (const [mediaId, info] of Array.from(lastByMedia.entries())) {
    const lock = lockFromLastPurchase(info.at, now)
    if (lock.locked) {
      locked.push({ mediaId, title: info.title, ...lock })
    }
  }
  return locked
}

export class PurchaseDeleteLockError extends Error {
  readonly code = 'PURCHASE_DELETE_LOCK'
  constructor(message: string) {
    super(message)
    this.name = 'PurchaseDeleteLockError'
  }
}

export async function assertOwnerCanDeleteAccount(userId: string) {
  const locks = await activePurchaseDeleteLocksForOwner(userId)
  if (locks.length === 0) return
  const titles = locks
    .slice(0, 3)
    .map((lock) => lock.title)
    .join(', ')
  const more = locks.length > 3 ? ` and ${locks.length - 3} more` : ''
  throw new PurchaseDeleteLockError(
    `This account cannot be deleted yet. Sold content (${titles}${more}) stays up for 10 days after the latest purchase.`
  )
}
