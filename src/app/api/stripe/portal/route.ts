import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Generate cancellation email HTML
function generateCancellationEmail(userName: string, previousPlan: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px; border-radius: 12px; margin-bottom: 20px;">
    <h1 style="color: #fff; margin: 0; font-size: 24px;">Subscription Cancelled</h1>
  </div>

  <p style="font-size: 16px;">Dear ${userName},</p>

  <p style="font-size: 16px;">Your <strong>${previousPlan}</strong> subscription has been cancelled successfully.</p>

  <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
    <p style="margin: 0; font-size: 14px;"><strong>What happens now:</strong></p>
    <ul style="margin: 10px 0 0 0; padding-left: 20px; font-size: 14px;">
      <li>Your account has been downgraded to Viewer (Free)</li>
      <li>Your existing uploads will remain on the platform</li>
      <li>You can still browse and enjoy all public content</li>
      <li>You can resubscribe anytime to upload new content</li>
    </ul>
  </div>

  <p style="font-size: 16px;">We're sorry to see you go! If you have any feedback or questions, please don't hesitate to reach out.</p>

  <div style="text-align: center; margin: 30px 0;">
    <a href="https://www.aimediatank.com/pricing" style="display: inline-block; background: linear-gradient(135deg, #0f8 0%, #0a6 100%); color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
      Resubscribe Anytime
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
}

// POST - Create Stripe billing portal session or handle membership cancellation
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in' }, { status: 401 })
    }

    // Parse body safely
    let action: string | undefined
    let sendEmailFlag = false
    try {
      const text = await request.text()
      if (text) {
        const body = JSON.parse(text)
        action = body.action
        sendEmailFlag = body.sendEmail === true
      }
    } catch {
      // No body or invalid JSON, that's fine
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { 
        stripeCustomerId: true, 
        stripeSubscriptionId: true,
        membershipType: true,
        email: true,
        name: true,
        username: true,
      },
    })

    // Handle actions first
    if (action === 'cancel') {
      const previousPlan = user?.membershipType || 'BASIC'
      
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          membershipType: 'VIEWER',
          stripeSubscriptionId: null,
        },
      })

      // Send cancellation email
      if (user?.email) {
        const userName = user.name || user.username || 'Valued Customer'
        await sendEmail({
          to: user.email,
          subject: 'Subscription Cancelled - AI Media Tank',
          html: generateCancellationEmail(userName, previousPlan),
        })
      }

      return NextResponse.json({ 
        success: true, 
        message: 'Subscription cancelled. A confirmation email has been sent.',
      })
    }

    if (action === 'downgrade') {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          membershipType: 'BASIC',
        },
      })
      return NextResponse.json({ 
        success: true, 
        message: 'Downgraded to Basic successfully.',
      })
    }

    if (action === 'upgrade') {
      await prisma.user.update({
        where: { id: session.user.id },
        data: {
          membershipType: 'PREMIUM',
        },
      })
      return NextResponse.json({ 
        success: true, 
        message: 'Upgraded to Premium successfully.',
      })
    }

    // If user has Stripe customer ID, try to open billing portal
    if (user?.stripeCustomerId && isStripeConfigured()) {
      try {
        const stripe = getStripe()
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: user.stripeCustomerId,
          return_url: `${process.env.NEXTAUTH_URL}/pricing`,
        })
        return NextResponse.json({ url: portalSession.url })
      } catch (stripeError: any) {
        console.error('Stripe portal error:', stripeError)
        // Fall through to manual management
      }
    }

    // Return manual management options
    return NextResponse.json({ 
      showManualOptions: true,
      currentPlan: user?.membershipType || 'VIEWER',
    })
  } catch (error: any) {
    console.error('Error in portal:', error)
    return NextResponse.json(
      { error: 'Failed to manage subscription', details: error.message },
      { status: 500 }
    )
  }
}

