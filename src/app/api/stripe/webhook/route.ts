import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'
import { sendEmail, generatePurchaseEmail, generateMembershipPurchaseEmail } from '@/lib/email'

// Plan upload conditions for emails
const PLAN_CONDITIONS: Record<string, { name: string; uploadCondition: string }> = {
  viewer: { name: 'Viewer Plan', uploadCondition: 'Five Free Uploads' },
  basic: { name: 'Basic Plan', uploadCondition: 'Five Free Uploads, then $1 per upload' },
  advanced: { name: 'Advanced Plan', uploadCondition: 'Five Free Uploads, then $0.5 per upload' },
  premium: { name: 'Premium Plan', uploadCondition: 'Unlimited Free Uploads' },
}

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
    
    // Handle membership subscription events
    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      
      // Find user by Stripe customer ID
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: customerId },
      })
      
      if (user) {
        // Get plan from subscription metadata or line items
        const metadata = subscription.metadata
        const planId = metadata?.planId || 'basic'
        const planConfig = PLAN_CONDITIONS[planId] || PLAN_CONDITIONS.basic
        
        // Determine membership type based on plan
        const membershipType = planId.toUpperCase()
        
        // Calculate expiration date
        const periodEnd = new Date(subscription.current_period_end * 1000)
        
        // Update user membership
        await prisma.user.update({
          where: { id: user.id },
          data: {
            membershipType,
            membershipExpiresAt: periodEnd,
            stripeSubscriptionId: subscription.id,
            role: 'SUBSCRIBER',
            // Reset free uploads when subscription changes
            freeUploadsUsed: 0,
            freeUploadsResetAt: periodEnd,
          },
        })
        
        // Send membership confirmation email (only for new subscriptions)
        if (event.type === 'customer.subscription.created') {
          const priceAmount = subscription.items.data[0]?.price?.unit_amount || 0
          const price = `$${(priceAmount / 100).toFixed(2)}/month`
          
          const emailHtml = generateMembershipPurchaseEmail(
            user.name || user.username,
            planConfig.name,
            price,
            'Monthly',
            planConfig.uploadCondition
          )
          
          await sendEmail({
            to: user.email,
            subject: `🎉 Welcome to ${planConfig.name}! | AI Media Tank`,
            html: emailHtml
          })
          
          console.log(`Sent membership confirmation email to ${user.email} for ${planConfig.name}`)
          
          // Create in-app notification
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'system',
              title: 'Membership Activated! 🎉',
              message: `Welcome to ${planConfig.name}! You now have ${planConfig.uploadCondition}.`,
              link: '/pricing',
            }
          })
        }
        
        console.log(`Updated user ${user.id} to ${membershipType} membership`)
      }
      break
    }
    
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription
      const customerId = subscription.customer as string
      
      // Find user and downgrade to VIEWER
      const user = await prisma.user.findFirst({
        where: { stripeCustomerId: customerId },
      })
      
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            membershipType: 'VIEWER',
            membershipExpiresAt: null,
            stripeSubscriptionId: null,
            role: 'VIEWER',
          },
        })
        
        console.log(`Downgraded user ${user.id} to VIEWER membership`)
        
        // Create in-app notification
        await prisma.notification.create({
          data: {
            userId: user.id,
            type: 'system',
            title: 'Subscription Cancelled',
            message: 'Your membership has been cancelled. You are now on the Viewer Plan with 5 free uploads.',
            link: '/pricing',
          }
        })
      }
      break
    }
    
    default:
      console.log(`Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}



