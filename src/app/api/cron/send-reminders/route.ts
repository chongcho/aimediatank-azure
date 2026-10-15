import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail, generateDownloadReminderEmail } from '@/lib/email'
import { requireCronAuth } from '@/lib/cronAuth'
import { lockFromLastPurchase, purchaseAnchor } from '@/lib/purchaseDeleteLock'

export const dynamic = 'force-dynamic'

// Remind buyers at 7, 3, and 1 days before the poster can remove purchased media.
// The clock is 10 days after the latest completed purchase of that media.

export async function GET(request: Request) {
  const authError = requireCronAuth(request)
  if (authError) return authError

  const now = new Date()
  const results: any[] = []

  try {
    const purchasesNeedingReminders = await prisma.purchase.findMany({
      where: {
        status: 'completed',
        media: { isDeleted: false },
      },
      include: {
        buyer: {
          select: { id: true, email: true, name: true, username: true },
        },
        media: {
          select: { id: true, title: true },
        },
      },
    })

    const lastPurchaseByMedia = new Map<string, Date>()
    for (const purchase of purchasesNeedingReminders) {
      const at = purchaseAnchor(purchase)
      const prev = lastPurchaseByMedia.get(purchase.media.id)
      if (!prev || at > prev) lastPurchaseByMedia.set(purchase.media.id, at)
    }

    // Group purchases by buyer
    const purchasesByBuyer: Record<string, typeof purchasesNeedingReminders> = {}
    
    for (const purchase of purchasesNeedingReminders) {
      const buyerId = purchase.buyer.id
      if (!purchasesByBuyer[buyerId]) {
        purchasesByBuyer[buyerId] = []
      }
      purchasesByBuyer[buyerId].push(purchase)
    }

    // Process each buyer
    for (const buyerId of Object.keys(purchasesByBuyer)) {
      const purchases = purchasesByBuyer[buyerId]
      const buyer = purchases[0].buyer
      
      // Days until the poster can remove each item (from that item's latest purchase)
      const itemsWithDays = purchases.map(p => {
        const lastPurchaseAt = lastPurchaseByMedia.get(p.media.id)!
        const lock = lockFromLastPurchase(lastPurchaseAt, now)
        return {
          title: p.media.title,
          daysLeft: lock.daysLeft ?? 0,
          mediaId: p.media.id,
        }
      })

      const seenMedia = new Set<string>()
      const urgentItems = itemsWithDays.filter((item) => {
        if (seenMedia.has(item.mediaId)) return false
        if (![7, 3, 1].includes(item.daysLeft)) return false
        seenMedia.add(item.mediaId)
        return true
      })
      const minDaysRemaining = urgentItems.length
        ? Math.min(...urgentItems.map((item) => item.daysLeft))
        : null

      if (minDaysRemaining != null) {
        const buyerName = buyer.name || buyer.username || 'Valued Customer'
        const buyerEmail = buyer.email

        if (urgentItems.length > 0) {
          const emailHtml = generateDownloadReminderEmail(
            buyerName,
            urgentItems.length,
            minDaysRemaining,
            urgentItems
          )

          const sent = await sendEmail({
            to: buyerEmail,
            subject: `⏰ ${minDaysRemaining} Day${minDaysRemaining > 1 ? 's' : ''} Left — The poster can remove your purchase | AI Media Tank (AMT)`,
            html: emailHtml,
          })

          // Create in-app notification
          const itemTitles = urgentItems.map(i => i.title).slice(0, 3).join(', ')
          const moreItems = urgentItems.length > 3 ? ` and ${urgentItems.length - 3} more` : ''
          await prisma.notification.create({
            data: {
              userId: buyerId,
              type: 'download_reminder',
              title: `⏰ ${minDaysRemaining} Day${minDaysRemaining > 1 ? 's' : ''} Left!`,
              message: `The poster can remove "${itemTitles}"${moreItems} after 10 days.`,
              link: `/profile/${buyer.username}`,
            }
          })

          results.push({
            buyerId,
            buyerEmail,
            itemCount: urgentItems.length,
            minDaysRemaining,
            emailSent: sent,
          })
        }
      }
    }

    const totalBuyers = Object.keys(purchasesByBuyer).length
    console.log(`Reminder cron completed. Processed ${totalBuyers} buyers, sent ${results.filter(r => r.emailSent).length} emails`)

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      totalBuyers,
      remindersSent: results.length,
      results,
    })
  } catch (error: any) {
    console.error('Error in reminder cron:', error)
    return NextResponse.json(
      { 
        error: 'Failed to process reminders', 
        details: error.message,
        results,
      },
      { status: 500 }
    )
  }
}

// POST endpoint for manual trigger
export async function POST(request: Request) {
  return GET(request)
}

