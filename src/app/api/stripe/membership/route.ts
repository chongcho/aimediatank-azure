import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import {
  blockIosNativeExternalPayments,
  iosExternalPaymentsBlockedResponse,
} from '@/lib/iosAppStoreCompliance'
import { getStripeMembershipCheckoutPlan } from '@/lib/membershipPlans'

export const dynamic = 'force-dynamic'

// POST - Create membership subscription checkout session
export async function POST(request: Request) {
  try {
    if (blockIosNativeExternalPayments(request)) {
      return iosExternalPaymentsBlockedResponse()
    }

    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Payment system is not configured' },
        { status: 500 }
      )
    }

    const stripe = getStripe()
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Please log in' }, { status: 401 })
    }

    const { planId, billingPeriod = 'month' } = await request.json()

    const plan = typeof planId === 'string' ? await getStripeMembershipCheckoutPlan(planId) : null
    if (!plan) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 })
    }

    if (billingPeriod !== 'month' && billingPeriod !== 'year') {
      return NextResponse.json({ error: 'Invalid billing period' }, { status: 400 })
    }

    const amount = billingPeriod === 'year' ? plan.yearlyAmount : plan.amount
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Invalid plan price' }, { status: 400 })
    }

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

    // Create checkout session for subscription with Admin Panel pricing
    const billingLabel = billingPeriod === 'year' ? 'Yearly' : 'Monthly'
    const normalizedPlanId = String(planId).trim().toLowerCase()
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
              description: `AI Media Tank (AMT) ${plan.name} - ${billingLabel} Subscription`,
            },
            unit_amount: amount,
            recurring: {
              interval: interval as 'month' | 'year',
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXTAUTH_URL || 'https://aimediatank.com'}/pricing?success=true&plan=${normalizedPlanId}`,
      cancel_url: `${process.env.NEXTAUTH_URL || 'https://aimediatank.com'}/pricing?canceled=true`,
      subscription_data: {
        metadata: {
          userId: session.user.id,
          planId: normalizedPlanId,
          billingPeriod,
          type: 'membership',
        },
      },
      metadata: {
        userId: session.user.id,
        planId: normalizedPlanId,
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
