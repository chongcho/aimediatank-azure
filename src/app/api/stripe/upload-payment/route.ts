import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Upload costs per plan
const UPLOAD_COSTS: Record<string, number> = {
  BASIC: 100, // $1.00 in cents
  ADVANCED: 50, // $0.50 in cents
}

export async function POST(request: Request) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Payment system is not configured' },
        { status: 500 }
      )
    }

    const stripe = getStripe()
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { 
        email: true, 
        stripeCustomerId: true, 
        membershipType: true,
        freeUploadsUsed: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if user needs to pay for upload
    const uploadCost = UPLOAD_COSTS[user.membershipType]
    if (!uploadCost) {
      return NextResponse.json({ error: 'Your plan does not support paid uploads' }, { status: 400 })
    }

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { userId: session.user.id },
      })
      customerId = customer.id

      await prisma.user.update({
        where: { id: session.user.id },
        data: { stripeCustomerId: customerId },
      })
    }

    // Create checkout session for single upload payment
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Upload Fee',
              description: `Single upload fee for ${user.membershipType} Plan`,
            },
            unit_amount: uploadCost,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXTAUTH_URL || 'https://aimediatank.com'}/upload?payment=success`,
      cancel_url: `${process.env.NEXTAUTH_URL || 'https://aimediatank.com'}/upload?payment=cancelled`,
      metadata: {
        userId: session.user.id,
        type: 'upload_fee',
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error: any) {
    console.error('Error creating upload payment:', error)
    return NextResponse.json(
      { error: 'Failed to create payment session', details: error.message },
      { status: 500 }
    )
  }
}

