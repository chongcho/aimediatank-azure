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

    const { planId, billingPeriod = 'month' } = await request.json()

    if (!planId || !PLAN_PRICES[planId]) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 })
    }

    if (billingPeriod !== 'month' && billingPeriod !== 'year') {
      return NextResponse.json({ error: 'Invalid billing period' }, { status: 400 })
    }

    const plan = PLAN_PRICES[planId]
    const amount = billingPeriod === 'year' ? plan.yearlyAmount : plan.amount
    const interval = billingPeriod === 'year' ? 'year' : 'month'
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

      // Update user with Stripe customer ID and policy agreement
      await prisma.user.update({
        where: { id: session.user.id },
        data: { 
          stripeCustomerId: customerId,
          policyAgreedAt: new Date(),
        },
      })
    } else {
      // Update policy agreement date for existing customers
      await prisma.user.update({
        where: { id: session.user.id },
        data: { policyAgreedAt: new Date() },
      })
    }

    // Create checkout session for subscription with dynamic pricing
    const billingLabel = billingPeriod === 'year' ? 'Yearly' : 'Monthly'
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: plan.name,
              description: `AI Media Tank ${plan.name} - ${billingLabel} Subscription`,
            },
            unit_amount: amount,
            recurring: {
              interval: interval as 'month' | 'year',
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXTAUTH_URL || 'https://aimediatank.com'}/pricing?success=true&plan=${planId}`,
      cancel_url: `${process.env.NEXTAUTH_URL || 'https://aimediatank.com'}/pricing?canceled=true`,
      subscription_data: {
        metadata: {
          userId: session.user.id,
          planId,
          billingPeriod,
          type: 'membership',
        },
      },
      metadata: {
        userId: session.user.id,
        planId,
        billingPeriod,
        type: 'membership',
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error: any) {
    console.error('Error creating membership checkout:', error)
    
    // Return more detailed error for debugging
    const errorMessage = error?.message || 'Unknown error'
    const errorType = error?.type || 'unknown'
    const errorCode = error?.code || 'unknown'
    
    return NextResponse.json(
      { 
        error: 'Failed to create checkout session', 
        details: errorMessage,
        type: errorType,
        code: errorCode
      },
      { status: 500 }
    )
  }
}

