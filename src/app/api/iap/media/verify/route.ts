import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseMediaUnlockProductId } from '@/lib/appleIapCatalog'
import { verifyAppleTransactionJws } from '@/lib/appleIapVerify'
import { isNativeIosClientFromRequest } from '@/lib/iosAppStoreCompliance'

export const dynamic = 'force-dynamic'

/**
 * POST { signedTransaction: string, mediaId: string }
 * Completes a paid-media unlock via Apple consumable IAP (price-tier product).
 */
export async function POST(request: Request) {
  try {
    if (!isNativeIosClientFromRequest(request)) {
      return NextResponse.json({ error: 'Apple IAP is only available in the iOS app' }, { status: 403 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    }

    const body = (await request.json()) as { signedTransaction?: unknown; mediaId?: unknown }
    const signedTransaction =
      typeof body.signedTransaction === 'string' ? body.signedTransaction.trim() : ''
    const mediaId = typeof body.mediaId === 'string' ? body.mediaId.trim() : ''
    if (!signedTransaction || !mediaId) {
      return NextResponse.json({ error: 'Missing signedTransaction or mediaId' }, { status: 400 })
    }

    const txn = await verifyAppleTransactionJws(signedTransaction)
    const tier = parseMediaUnlockProductId(txn.productId)
    if (!tier) {
      return NextResponse.json({ error: 'Unknown media unlock product' }, { status: 400 })
    }

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      select: {
        id: true,
        price: true,
        userId: true,
        isSold: true,
        title: true,
      },
    })
    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }
    if (media.userId === session.user.id) {
      return NextResponse.json({ error: 'You already own this media' }, { status: 400 })
    }
    if (!media.price || media.price <= 0) {
      return NextResponse.json({ error: 'This media is free' }, { status: 400 })
    }
    if (media.isSold) {
      return NextResponse.json({ error: 'This media is no longer available' }, { status: 400 })
    }
    if (tier.usd + 1e-9 < media.price) {
      return NextResponse.json(
        { error: 'Purchased unlock tier is too low for this media price' },
        { status: 400 }
      )
    }

    const alreadyOwned = await prisma.purchase.findFirst({
      where: { buyerId: session.user.id, mediaId, status: 'completed' },
    })
    if (alreadyOwned) {
      return NextResponse.json({ ok: true, duplicate: true, purchaseId: alreadyOwned.id })
    }

    const existingTxn = await prisma.appleIapTransaction.findUnique({
      where: { transactionId: txn.transactionId },
    })
    if (existingTxn) {
      return NextResponse.json({ ok: true, duplicate: true })
    }

    const now = new Date()
    const deleteAfter = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000)

    const purchase = await prisma.purchase.create({
      data: {
        amount: media.price,
        currency: 'usd',
        status: 'completed',
        appleTransactionId: txn.transactionId,
        appleProductId: txn.productId,
        completedAt: now,
        buyerId: session.user.id,
        mediaId,
        sellerId: media.userId,
      },
    })

    await prisma.media.update({
      where: { id: mediaId },
      data: {
        isSold: true,
        deleteAfter,
      },
    })

    await prisma.appleIapTransaction.create({
      data: {
        transactionId: txn.transactionId,
        originalTransactionId: txn.originalTransactionId,
        productId: txn.productId,
        userId: session.user.id,
        kind: 'media',
        mediaId,
        environment: txn.environment ?? null,
      },
    })

    try {
      await prisma.notification.create({
        data: {
          userId: session.user.id,
          type: 'system',
          title: 'Purchase Confirmed! 🎉',
          message: `You unlocked "${media.title || 'media'}". Download within 10 days.`,
          link: `/media/${mediaId}`,
        },
      })
    } catch {
      /* ignore */
    }

    return NextResponse.json({ ok: true, purchaseId: purchase.id })
  } catch (error) {
    console.error('[iap/media/verify]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify Apple purchase' },
      { status: 500 }
    )
  }
}
