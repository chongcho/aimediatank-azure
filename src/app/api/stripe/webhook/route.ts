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
      
      console.log(`Checkout session completed: mode=${session.mode}, metadata=`, session.metadata)
      
      // Handle subscription checkout (membership purchase)
      if (session.mode === 'subscription' && session.metadata?.type === 'membership') {
        const userId = session.metadata.userId
        const planId = session.metadata.planId || 'basic'
        const billingPeriod = session.metadata.billingPeriod || 'month'
        const customerId = session.customer as string
        const subscriptionId = session.subscription as string
        
        console.log(`Processing membership checkout: userId=${userId}, planId=${planId}, customerId=${customerId}`)
        
        if (userId) {
          const planConfig = PLAN_CONDITIONS[planId] || PLAN_CONDITIONS.basic
          const membershipType = planId.toUpperCase()
          
          // Calculate expiration (1 month or 1 year from now)
          const periodEnd = new Date()
          if (billingPeriod === 'year') {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1)
          } else {
            periodEnd.setMonth(periodEnd.getMonth() + 1)
          }
          
          // Update user membership
          const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: {
              membershipType,
              membershipExpiresAt: periodEnd,
              stripeCustomerId: customerId,
              stripeSubscriptionId: subscriptionId,
              role: 'SUBSCRIBER',
              freeUploadsUsed: 0,
              freeUploadsResetAt: periodEnd,
            },
          })
          
          console.log(`Updated user ${userId} to ${membershipType} membership, expires: ${periodEnd}`)
          
          // Send membership confirmation email
          const priceAmount = planId === 'basic' ? 2 : planId === 'advanced' ? 5 : 8
          const price = billingPeriod === 'year' 
            ? `$${priceAmount * 10}/year` 
            : `$${priceAmount}/month`
          
          const emailHtml = generateMembershipPurchaseEmail(
            updatedUser.name || updatedUser.username,
            planConfig.name,
            price,
            billingPeriod === 'year' ? 'Yearly' : 'Monthly',
            planConfig.uploadCondition
          )
          
          await sendEmail({
            to: updatedUser.email,
            subject: `🎉 Welcome to ${planConfig.name}! | AI Media Tank`,
            html: emailHtml
          })
          
          console.log(`Sent membership confirmation email to ${updatedUser.email}`)
          
          // Create in-app notification
          await prisma.notification.create({
            data: {
              userId: userId,
              type: 'system',
              title: 'Membership Activated! 🎉',
              message: `Welcome to ${planConfig.name}! You now have ${planConfig.uploadCondition}.`,
              link: '/pricing',
            }
          })
        }
        
        break
      }
      
      // Handle upload fee payment - automatically create media from pending upload
      if (session.mode === 'payment' && session.metadata?.type === 'upload_fee') {
        const userId = session.metadata.userId
        const pendingUploadId = session.metadata.pendingUploadId
        const mediaTitle = session.metadata.mediaTitle || 'Untitled'
        
        console.log(`Processing upload_fee payment for userId: ${userId}, pendingUploadId: ${pendingUploadId}`)
        
        if (userId && pendingUploadId) {
          // Find the pending upload
          const pendingUpload = await prisma.pendingUpload.findUnique({
            where: { id: pendingUploadId },
          })
          
          if (!pendingUpload) {
            console.error(`Pending upload ${pendingUploadId} not found`)
            break
          }
          
          // Create the actual media record
          const media = await prisma.media.create({
            data: {
              title: pendingUpload.title,
              description: pendingUpload.description || '',
              type: pendingUpload.type as 'VIDEO' | 'IMAGE' | 'MUSIC',
              url: pendingUpload.url,
              thumbnailUrl: pendingUpload.thumbnailUrl,
              aiTool: pendingUpload.aiTool,
              aiPrompt: pendingUpload.aiPrompt,
              hashtags: pendingUpload.hashtags,
              price: pendingUpload.price,
              isPublic: pendingUpload.isPublic,
              isApproved: true,
              userId: pendingUpload.userId,
            },
          })
          
          console.log(`Created media ${media.id} from pending upload ${pendingUploadId}`)
          
          // Delete the pending upload
          await prisma.pendingUpload.delete({
            where: { id: pendingUploadId },
          })
          
          // Get user for email
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true, username: true, membershipType: true }
          })
          
          if (user) {
            const userName = user.name || user.username || 'User'
            const uploadCost = user.membershipType === 'ADVANCED' ? 0.50 : 1.00
            
            // Send success email
            const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #0f8; margin: 0; font-size: 24px;">🎉 Upload Complete!</h1>
  </div>
  
  <p style="font-size: 16px;">Hi ${userName},</p>
  
  <p style="font-size: 16px;">Your paid upload has been successfully processed and is now live!</p>
  
  <div style="background: #f0fff0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #0f8;">
    <p style="margin: 0 0 10px 0; font-weight: bold; color: #0f8;">Upload Summary:</p>
    <ul style="list-style: none; padding: 0; margin: 0;">
      <li style="margin-bottom: 8px;"><strong>Title:</strong> ${pendingUpload.title}</li>
      <li style="margin-bottom: 8px;"><strong>Type:</strong> ${pendingUpload.type}</li>
      <li style="margin-bottom: 8px;"><strong>Upload Fee:</strong> $${uploadCost.toFixed(2)}</li>
      <li style="margin-bottom: 8px;"><strong>Status:</strong> ✅ Published</li>
    </ul>
  </div>
  
  <div style="text-align: center; margin: 30px 0;">
    <a href="https://aimediatank.com/media/${media.id}" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      View Your Upload
    </a>
  </div>
  
  <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
  
  <p style="font-size: 14px; color: #666;">
    Sincerely,<br>
    <strong>AI Media Tank Team</strong>
  </p>
</body>
</html>
            `
            
            await sendEmail({
              to: user.email,
              subject: `🎉 Upload Complete: "${pendingUpload.title}" | AI Media Tank`,
              html: emailHtml
            })
            
            console.log(`Sent upload complete email to ${user.email}`)
            
            // Create in-app notification
            await prisma.notification.create({
              data: {
                userId: userId,
                type: 'system',
                title: '🎉 Upload Complete!',
                message: `Your paid upload "${pendingUpload.title}" is now live!`,
                link: `/media/${media.id}`,
              }
            })
          }
        }
        
        break
      }
      
      // Handle media purchase checkout (existing logic)
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



