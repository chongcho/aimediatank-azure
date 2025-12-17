import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const PLAN_PRICES: Record<string, { priceId: string; amount: number; yearlyAmount: number; name: string; uploadCost: number }> = {
  basic: {
    priceId: process.env.STRIPE_BASIC_PRICE_ID || 'price_basic',
    amount: 200, // $2.00/month
    yearlyAmount: 2000, // $20.00/year
    name: 'Basic Plan',
    uploadCost: 100, // $1.00 per upload
  },
  advanced: {
    priceId: process.env.STRIPE_ADVANCED_PRICE_ID || 'price_advanced',
    amount: 500, // $5.00/month
    yearlyAmount: 5000, // $50.00/year
    name: 'Advanced Plan',
    uploadCost: 50, // $0.50 per upload
  },
  premium: {
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_premium',
    amount: 800, // $8.00/month
    yearlyAmount: 8000, // $80.00/year
    name: 'Premium Plan',
    uploadCost: 0, // Free uploads
  },
}

// POST - Create membership subscription checkout session
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

    const { planId } = await request.json()

    if (!planId || !PLAN_PRICES[planId]) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 })
    }

    const plan = PLAN_PRICES[planId]
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, stripeCustomerId: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Create or retrieve Stripe customer
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

    // Create checkout session for subscription using existing Stripe price
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXTAUTH_URL}/pricing?success=true&plan=${planId}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/pricing?canceled=true`,
      metadata: {
        userId: session.user.id,
        planId,
        type: 'membership',
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error: any) {
    console.error('Error creating membership checkout:', error)
    return NextResponse.json(
      { error: 'Failed to create checkout session', details: error.message },
      { status: 500 }
    )
  }
}

