import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseMembershipProductId } from '@/lib/appleIapCatalog'
import { verifyAppleTransactionJws } from '@/lib/appleIapVerify'
import { applyAppleMembershipEntitlement } from '@/lib/applyAppleMembership'
import { isNativeIosClientFromRequest } from '@/lib/iosAppStoreCompliance'

export const dynamic = 'force-dynamic'

/**
 * POST { signedTransaction: string } — StoreKit 2 JWS from native iOS.
 * Applies membership entitlement for the logged-in user.
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

    const body = (await request.json()) as { signedTransaction?: unknown }
    const signedTransaction =
      typeof body.signedTransaction === 'string' ? body.signedTransaction.trim() : ''
    if (!signedTransaction) {
      return NextResponse.json({ error: 'Missing signedTransaction' }, { status: 400 })
    }

    const txn = await verifyAppleTransactionJws(signedTransaction)
    const product = parseMembershipProductId(txn.productId)
    if (!product) {
      return NextResponse.json({ error: 'Unknown membership product' }, { status: 400 })
    }

    const existing = await prisma.appleIapTransaction.findUnique({
      where: { transactionId: txn.transactionId },
    })
    if (existing) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { membershipType: true, membershipExpiresAt: true },
      })
      return NextResponse.json({
        ok: true,
        duplicate: true,
        membershipType: user?.membershipType,
        membershipExpiresAt: user?.membershipExpiresAt,
      })
    }

    const result = await applyAppleMembershipEntitlement({
      userId: session.user.id,
      planId: product.planId,
      billingPeriod: product.billingPeriod,
      originalTransactionId: txn.originalTransactionId,
      productId: txn.productId,
      expiresDateMs: txn.expiresDate,
    })

    await prisma.appleIapTransaction.create({
      data: {
        transactionId: txn.transactionId,
        originalTransactionId: txn.originalTransactionId,
        productId: txn.productId,
        userId: session.user.id,
        kind: 'membership',
        environment: txn.environment ?? null,
      },
    })

    await prisma.user.update({
      where: { id: session.user.id },
      data: { policyAgreedAt: new Date() },
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('[iap/membership/verify]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to verify Apple purchase' },
      { status: 500 }
    )
  }
}
