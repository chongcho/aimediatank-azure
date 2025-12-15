import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'
import { sendEmail, generatePurchaseEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      
      // Get all purchases for this session with media and buyer details
      const purchases = await prisma.purchase.findMany({
        where: { stripeSessionId: session.id },
        include: {
          media: {
            select: { id: true, title: true, price: true }
          },
          buyer: {
            select: { id: true, email: true, name: true, username: true }
          }
        },
      })
      
      // Update purchase status
      await prisma.purchase.updateMany({
        where: { stripeSessionId: session.id },
        data: {
          status: 'completed',
          stripePaymentId: session.payment_intent as string,
          completedAt: new Date(),
        },
      })
      
      // Mark all purchased media as SOLD with 10-day deletion schedule
      const now = new Date()
      const deleteAfter = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000) // 10 days from now
      
      for (const purchase of purchases) {
        await prisma.media.update({
          where: { id: purchase.mediaId },
          data: {
            isSold: true,
            soldAt: now,
            deleteAfter: deleteAfter,
          },
        })
      }
      
      console.log(`Marked ${purchases.length} media items as SOLD, scheduled for deletion on ${deleteAfter.toISOString()}`)
      
      // Send email notification to buyer
      if (purchases.length > 0) {
        const buyer = purchases[0].buyer
        const buyerEmail = buyer.email
        const buyerName = buyer.name || buyer.username || 'Valued Customer'
        
        const items = purchases.map(p => ({
          title: p.media.title,
          price: p.media.price || 0
        }))
        
        const emailHtml = generatePurchaseEmail(buyerName, purchases.length, items)
        
        await sendEmail({
          to: buyerEmail,
          subject: `🎉 Purchase Confirmed - Download Your ${purchases.length} Item${purchases.length > 1 ? 's' : ''} | AI Media Tank`,
          html: emailHtml
        })
        
        console.log(`Sent purchase confirmation email to ${buyerEmail}`)

        // Create in-app notification
        const itemTitles = items.map(i => i.title).join(', ')
        await prisma.notification.create({
          data: {
            userId: buyer.id,
            type: 'purchase',
            title: 'Purchase Confirmed! 🎉',
            message: `Your purchase of "${itemTitles}" is complete. Download within 10 days before it expires.`,
            link: `/profile/${buyer.username}`,
          }
        })
      }
      
      break
    }
    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session
      
      await prisma.purchase.updateMany({
        where: { stripeSessionId: session.id },
        data: { status: 'failed' },
      })
      break
    }
    default:
      console.log(`Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}



