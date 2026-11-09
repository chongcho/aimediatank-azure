import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseMembershipProductId } from '@/lib/appleIapCatalog'
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
 * Downgrades to Viewer when Apple shows expired/revoked or device has no entitlements.
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

    // Prefer App Store Server API when configured.
    if (user.appleOriginalTransactionId) {
      const status = await fetchAppleSubscriptionStatuses(user.appleOriginalTransactionId)
      if (status) {
        // 1 Active, 3 Billing Retry, 4 Grace Period — keep access
        const stillEntitled = status.status === 1 || status.status === 3 || status.status === 4
        const expiredOrRevoked = status.status === 2 || status.status === 5 || status.status == null

        if (stillEntitled && status.productId) {
          const product = parseMembershipProductId(status.productId)
          if (product) {
            const applied = await applyAppleMembershipEntitlement({
              userId: session.user.id,
              planId: product.planId,
              billingPeriod: product.billingPeriod,
              originalTransactionId: status.originalTransactionId,
              productId: status.productId,
              expiresDateMs: status.expiresDateMs ?? undefined,
              sendNotifications: false,
            })
            if (status.autoRenewStatus === 0 && status.expiresDateMs) {
              await markAppleMembershipCanceledUntilExpiry({
                userId: session.user.id,
                membershipExpiresAt: new Date(status.expiresDateMs),
              })
              return NextResponse.json({
                ok: true,
                membershipType: applied.membershipType,
                membershipExpiresAt: applied.membershipExpiresAt,
                appleSubscriptionStatus: 'canceled',
                source: 'apple-server-api',
              })
            }
            return NextResponse.json({
              ok: true,
              membershipType: applied.membershipType,
              membershipExpiresAt: applied.membershipExpiresAt,
              appleSubscriptionStatus: 'active',
              source: 'apple-server-api',
            })
          }
        }

        if (expiredOrRevoked && paid) {
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
    if (noActiveEntitlements && paid) {
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
    if (
      paid &&
      user.membershipExpiresAt &&
      user.membershipExpiresAt.getTime() < Date.now()
    ) {
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

    return NextResponse.json({
      ok: true,
      membershipType: user.membershipType,
      membershipExpiresAt: user.membershipExpiresAt,
      appleSubscriptionStatus: user.appleSubscriptionStatus,
      source: 'unchanged',
    })
  } catch (error) {
    console.error('[iap/membership/sync]', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync Apple membership' },
      { status: 500 }
    )
  }
}
