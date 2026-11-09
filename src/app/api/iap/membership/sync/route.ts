import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { membershipPlanRank, parseMembershipProductId } from '@/lib/appleIapCatalog'
import { fetchAppleSubscriptionStatuses } from '@/lib/appleIapVerify'
import {
  applyAppleMembershipEntitlement,
  clearAppleMembershipToViewer,
  markAppleMembershipCanceledUntilExpiry,
} from '@/lib/applyAppleMembership'
import { isNativeIosClientFromRequest } from '@/lib/iosAppStoreCompliance'

export const dynamic = 'force-dynamic'

/**
 * POST { noActiveEntitlements?: boolean }
 * Sync Apple membership after restore / manage subscriptions.
 * Downgrades to Viewer only when Apple (or the device) clearly shows no remaining access.
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

    const body = (await request.json().catch(() => ({}))) as {
      noActiveEntitlements?: unknown
    }
    const noActiveEntitlements = body.noActiveEntitlements === true

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        membershipType: true,
        membershipExpiresAt: true,
        appleOriginalTransactionId: true,
        appleProductId: true,
        applePendingProductId: true,
        appleSubscriptionStatus: true,
      },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const paid =
      Boolean(user.membershipType) &&
      user.membershipType !== 'VIEWER' &&
      Boolean(user.appleOriginalTransactionId || user.appleProductId)

    const localStillValid =
      Boolean(user.membershipExpiresAt) && user.membershipExpiresAt!.getTime() > Date.now()

    const unchanged = () =>
      NextResponse.json({
        ok: true,
        membershipType: user.membershipType,
        membershipExpiresAt: user.membershipExpiresAt,
        appleSubscriptionStatus: user.appleSubscriptionStatus,
        applePendingProductId: user.applePendingProductId ?? null,
        source: 'unchanged',
      })

    // Prefer App Store Server API when configured.
    if (user.appleOriginalTransactionId) {
      const status = await fetchAppleSubscriptionStatuses(user.appleOriginalTransactionId)
      if (status) {
        // 1 Active, 3 Billing Retry, 4 Grace Period — keep access
        const stillEntitled = status.status === 1 || status.status === 3 || status.status === 4
        // Only treat explicit Expired (2) / Revoked (5) as ended — never status == null
        // (null/empty lastTransactions is common right after an upgrade while Apple catches up).
        const expiredOrRevoked = status.status === 2 || status.status === 5

        if (stillEntitled && status.productId) {
          const product = parseMembershipProductId(status.productId)
          if (product) {
            const pendingParsed = status.autoRenewProductId
              ? parseMembershipProductId(status.autoRenewProductId)
              : null
            const currentRank = membershipPlanRank(product.planId)
            const pendingRank = pendingParsed ? membershipPlanRank(pendingParsed.planId) : 0
            // Upgrade scheduled: autoRenew higher than current. Downgrade: autoRenew lower.
            const pendingUpgrade =
              pendingParsed && pendingRank > currentRank ? status.autoRenewProductId : null
            const pendingDowngrade =
              pendingParsed && pendingRank > 0 && pendingRank < currentRank
                ? status.autoRenewProductId
                : null
            const pendingProductId = pendingUpgrade || pendingDowngrade
            const pendingStatus = pendingUpgrade
              ? 'pending_upgrade'
              : pendingDowngrade
                ? 'pending_downgrade'
                : null

            const serverRank = currentRank
            const localRank = membershipPlanRank(user.membershipType)

            // After a successful Advanced purchase, Server API can lag on Basic.
            // Do not clobber the higher local plan unless Apple confirmed a deferred change.
            if (serverRank < localRank && localStillValid && !pendingProductId) {
              return unchanged()
            }

            const applied = await applyAppleMembershipEntitlement({
              userId: session.user.id,
              planId: product.planId,
              billingPeriod: product.billingPeriod,
              originalTransactionId: status.originalTransactionId,
              productId: status.productId,
              expiresDateMs: status.expiresDateMs ?? undefined,
              sendNotifications: false,
              pendingProductId: pendingProductId,
              subscriptionStatus: pendingStatus
                ? pendingStatus
                : status.autoRenewStatus === 0
                  ? 'canceled'
                  : 'active',
            })
            if (!pendingProductId && status.autoRenewStatus === 0 && status.expiresDateMs) {
              await markAppleMembershipCanceledUntilExpiry({
                userId: session.user.id,
                membershipExpiresAt: new Date(status.expiresDateMs),
              })
            }
            return NextResponse.json({
              ok: true,
              membershipType: applied.membershipType,
              membershipExpiresAt: applied.membershipExpiresAt,
              appleSubscriptionStatus: pendingStatus
                ? pendingStatus
                : status.autoRenewStatus === 0
                  ? 'canceled'
                  : 'active',
              applePendingProductId: pendingProductId,
              source: 'apple-server-api',
            })
          }
        }

        if (expiredOrRevoked && paid) {
          // Keep access if our period is still valid and Apple has a pending higher plan.
          const pendingParsed = status.autoRenewProductId
            ? parseMembershipProductId(status.autoRenewProductId)
            : null
          if (
            localStillValid &&
            pendingParsed &&
            membershipPlanRank(pendingParsed.planId) > membershipPlanRank(user.membershipType)
          ) {
            return unchanged()
          }
          if (localStillValid && !noActiveEntitlements) {
            return unchanged()
          }
          const cleared = await clearAppleMembershipToViewer({
            userId: session.user.id,
            appleSubscriptionStatus: status.status === 5 ? 'revoked' : 'expired',
          })
          return NextResponse.json({
            ok: true,
            ...cleared,
            appleSubscriptionStatus: status.status === 5 ? 'revoked' : 'expired',
            source: 'apple-server-api',
          })
        }
      }
    }

    // Device reported no StoreKit entitlements after restore/manage.
    // Skip wipe when our DB still has a future period (upgrade / sandbox lag).
    if (noActiveEntitlements && paid) {
      if (localStillValid) {
        return unchanged()
      }
      const cleared = await clearAppleMembershipToViewer({
        userId: session.user.id,
        appleSubscriptionStatus: 'expired',
      })
      return NextResponse.json({
        ok: true,
        ...cleared,
        appleSubscriptionStatus: 'expired',
        source: 'device-entitlements',
      })
    }

    // Local expiry clock (covers missed sync while offline).
    if (paid && user.membershipExpiresAt && user.membershipExpiresAt.getTime() < Date.now()) {
      const cleared = await clearAppleMembershipToViewer({
        userId: session.user.id,
        appleSubscriptionStatus: 'expired',
      })
      return NextResponse.json({
        ok: true,
        ...cleared,
        appleSubscriptionStatus: 'expired',
        source: 'local-expiry',
      })
    }

    return unchanged()
  } catch (error) {
    console.error('[iap/membership/sync]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync Apple membership' },
      { status: 500 }
    )
  }
}
