import { NextResponse } from 'next/server'
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

    return NextResponse.json({
      promo: {
        id: promo.id,
        popupTitle: promo.popupTitle,
        popupMessage: promo.popupMessage,
        popupButtonText: promo.popupButtonText,
        popupImageUrl: promo.popupImageUrl,
        promoCode: promo.promoCode,
        endDate: promo.endDate,
      },
    })
  } catch (err) {
    console.error('[active-popup]', err)
    return NextResponse.json({ promo: null })
  }
}
