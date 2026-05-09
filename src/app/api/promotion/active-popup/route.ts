import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * Returns the most relevant currently-active promotion that has been flagged
 * `showPopup` so the home page can render the marketing popup.
 *
 * Eligibility:
 *  - isActive = true
 *  - showPopup = true
 *  - startDate <= now <= endDate (or endDate is null)
 *  - usageCount < usageLimit (or usageLimit is null)
 *
 * Targeting:
 *  - When applicablePlans === "new_subscriber" the popup is hidden for users
 *    who already have an active paid membership (membershipType is BASIC /
 *    PREMIUM and not expired). It still shows to logged-out users and to
 *    free/expired members so they can claim the offer.
 *  - All other applicablePlans values fall through to "show to everyone"
 *    (no behavioural targeting from the popup; the value is informational
 *    until per-plan eligibility is wired in subscription flows).
 *
 * Picks the most recently started qualifying promotion if multiple match.
 */
export async function GET() {
  try {
    const now = new Date()
    const promo = await prisma.promotion.findFirst({
      where: {
        isActive: true,
        showPopup: true,
        startDate: { lte: now },
        OR: [{ endDate: null }, { endDate: { gte: now } }],
      },
      orderBy: { startDate: 'desc' },
    })

    if (!promo) return NextResponse.json({ promo: null })
    if (promo.usageLimit != null && promo.usageCount >= promo.usageLimit) {
      return NextResponse.json({ promo: null })
    }

    if (promo.applicablePlans === 'new_subscriber') {
      const session = await getServerSession(authOptions)
      const userId = (session?.user as { id?: string } | undefined)?.id
      if (userId) {
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { membershipType: true, membershipExpiresAt: true },
        })
        const isPaidActive =
          !!u &&
          u.membershipType !== 'VIEWER' &&
          (!u.membershipExpiresAt || u.membershipExpiresAt > now)
        if (isPaidActive) return NextResponse.json({ promo: null })
      }
    }

    return NextResponse.json({
      promo: {
        id: promo.id,
        popupTitle: promo.popupTitle,
        popupMessage: promo.popupMessage,
        popupButtonText: promo.popupButtonText,
        popupImageUrl: promo.popupImageUrl,
        popupCtaUrl: promo.popupCtaUrl,
        promoCode: promo.promoCode,
        endDate: promo.endDate,
      },
    })
  } catch (err) {
    console.error('[active-popup]', err)
    return NextResponse.json({ promo: null })
  }
}
