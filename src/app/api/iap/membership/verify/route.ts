import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  membershipPlanRank,
  parseMembershipProductId,
  type AppleMembershipPlanId,
} from '@/lib/appleIapCatalog'
import { verifyAppleTransactionJws } from '@/lib/appleIapVerify'
import {
  applyAppleMembershipEntitlement,
  clearAppleMembershipToViewer,
} from '@/lib/applyAppleMembership'
import { isNativeIosClientFromRequest } from '@/lib/iosAppStoreCompliance'

export const dynamic = 'force-dynamic'

/**
 * POST { signedTransaction: string, asCurrentEntitlement?: boolean }
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

    const body = (await request.json()) as {
      signedTransaction?: unknown
      /** When true, this JWS is from Transaction.currentEntitlements — apply even if lower tier. */
      asCurrentEntitlement?: unknown
    }
    const signedTransaction =
      typeof body.signedTransaction === 'string' ? body.signedTransaction.trim() : ''
    const asCurrentEntitlement = body.asCurrentEntitlement === true
    if (!signedTransaction) {
      return NextResponse.json({ error: 'Missing signedTransaction' }, { status: 400 })
    }

    const txn = await verifyAppleTransactionJws(signedTransaction)
    const product = parseMembershipProductId(txn.productId)
    if (!product) {
      return NextResponse.json({ error: 'Unknown membership product' }, { status: 400 })
    }

    const prior = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        membershipType: true,
        membershipExpiresAt: true,
        appleProductId: true,
      },
    })
    const priorRank = membershipPlanRank(prior?.membershipType)
    const buyRank = membershipPlanRank(product.planId)
    const priorStillValid =
      Boolean(prior?.membershipExpiresAt) && prior!.membershipExpiresAt!.getTime() > Date.now()

    // Stale/expired JWS must not wipe a still-valid equal/higher plan.
    if (typeof txn.expiresDate === 'number' && txn.expiresDate < Date.now()) {
      if (priorStillValid && priorRank >= buyRank) {
        return NextResponse.json({
          ok: true,
          expired: true,
          ignored: true,
          membershipType: prior?.membershipType,
          membershipExpiresAt: prior?.membershipExpiresAt,
        })
      }
      if (asCurrentEntitlement || !priorStillValid) {
        const cleared = await clearAppleMembershipToViewer({
          userId: session.user.id,
          appleSubscriptionStatus: 'expired',
          sendNotifications: false,
        })
        return NextResponse.json({ ok: true, expired: true, ...cleared })
      }
      return NextResponse.json({
        ok: true,
        expired: true,
        ignored: true,
        membershipType: prior?.membershipType,
        membershipExpiresAt: prior?.membershipExpiresAt,
      })
    }

    const existing = await prisma.appleIapTransaction.findUnique({
      where: { transactionId: txn.transactionId },
    })

    // Apple often schedules upgrades for the next renewal: keep Basic now, pending Advanced.
    const deferredUpgrade =
      !asCurrentEntitlement && priorStillValid && priorRank > 0 && buyRank > priorRank

    const applyCurrent = async () => {
      if (asCurrentEntitlement) {
        return applyAppleMembershipEntitlement({
          userId: session.user.id,
          planId: product.planId,
          billingPeriod: product.billingPeriod,
          originalTransactionId: txn.originalTransactionId,
          productId: txn.productId,
          expiresDateMs: txn.expiresDate,
          sendNotifications: false,
          pendingProductId: null,
          subscriptionStatus: 'active',
        })
      }
      if (deferredUpgrade) {
        const currentPlanId = String(prior!.membershipType).toLowerCase() as AppleMembershipPlanId
        await prisma.user.update({
          where: { id: session.user.id },
          data: {
            membershipType: String(prior!.membershipType).toUpperCase(),
            membershipExpiresAt: prior!.membershipExpiresAt,
            appleOriginalTransactionId: txn.originalTransactionId,
            applePendingProductId: txn.productId,
            appleSubscriptionStatus: 'pending_upgrade',
            // Do not replace current SKU with the future upgrade SKU.
            appleProductId: prior?.appleProductId ?? undefined,
          },
        })
        return {
          membershipType: String(prior!.membershipType).toUpperCase(),
          membershipExpiresAt: prior!.membershipExpiresAt!,
          appleSubscriptionStatus: 'pending_upgrade' as const,
          applePendingProductId: txn.productId,
        }
      }
      return applyAppleMembershipEntitlement({
        userId: session.user.id,
        planId: product.planId,
        billingPeriod: product.billingPeriod,
        originalTransactionId: txn.originalTransactionId,
        productId: txn.productId,
        expiresDateMs: txn.expiresDate,
        sendNotifications: !existing,
        pendingProductId: null,
        subscriptionStatus: 'active',
      })
    }

    if (existing) {
      if (asCurrentEntitlement || deferredUpgrade || buyRank >= priorRank) {
        const applied = await applyCurrent()
        return NextResponse.json({ ok: true, duplicate: true, ...applied })
      }
      return NextResponse.json({
        ok: true,
        duplicate: true,
        membershipType: prior?.membershipType,
        membershipExpiresAt: prior?.membershipExpiresAt,
      })
    }

    const result = await applyCurrent()

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
