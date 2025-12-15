import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail, generateDownloadReminderEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

// This cron job sends reminder emails to buyers whose purchases are expiring soon
// Run daily - sends reminders at 7 days, 3 days, and 1 day before deletion

export async function GET(request: Request) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow without auth for testing, but log warning
    console.log('Warning: Cron job called without proper authorization')
  }

  const now = new Date()
  const results: any[] = []

  try {
    // Find all completed purchases where media is sold but not yet deleted
    // Group by buyer to send one email per user
    const purchasesNeedingReminders = await prisma.purchase.findMany({
      where: {
        status: 'completed',
        media: {
          isSold: true,
          deleteAfter: {
            gt: now, // Not yet expired
          },
        },
      },
      include: {
        buyer: {
          select: { id: true, email: true, name: true, username: true },
        },
        media: {
          select: { id: true, title: true, deleteAfter: true },
        },
      },
    })

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
      
      // Calculate days remaining for each item
      const itemsWithDays = purchases.map(p => {
        const deleteDate = new Date(p.media.deleteAfter!)
        const diffTime = deleteDate.getTime() - now.getTime()
        const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        return {
          title: p.media.title,
          daysLeft,
          mediaId: p.media.id,
        }
      })

      // Find the minimum days remaining for this buyer's items
      const minDaysRemaining = Math.min(...itemsWithDays.map(i => i.daysLeft))

      // Determine if we should send a reminder based on days remaining
      // Send reminders at: 7 days, 3 days, 1 day
      const shouldSendReminder = [7, 3, 1].includes(minDaysRemaining)

      if (shouldSendReminder) {
        const buyerName = buyer.name || buyer.username || 'Valued Customer'
        const buyerEmail = buyer.email

        // Filter items that need attention (7 days or less)
        const urgentItems = itemsWithDays.filter(i => i.daysLeft <= 7)

        if (urgentItems.length > 0) {
          const emailHtml = generateDownloadReminderEmail(
            buyerName,
            urgentItems.length,
            minDaysRemaining,
            urgentItems
          )

          const sent = await sendEmail({
            to: buyerEmail,
            subject: `⏰ ${minDaysRemaining} Day${minDaysRemaining > 1 ? 's' : ''} Left - Download Your Purchases Before Deletion | AI Media Tank`,
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
              message: `Download "${itemTitles}"${moreItems} before they are permanently deleted.`,
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

