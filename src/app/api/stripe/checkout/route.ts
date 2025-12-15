import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe, formatAmountForStripe, isStripeConfigured } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST - Create checkout session for media purchase
export async function POST(request: Request) {
  try {
    // Check if Stripe is configured
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'Payment system is not configured. Please contact support.' },
        { status: 500 }
      )
    }

    const stripe = getStripe()
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to make a purchase' }, { status: 401 })
    }

    const { mediaId } = await request.json()

    if (!mediaId) {
      return NextResponse.json({ error: 'Media ID is required' }, { status: 400 })
    }

    const media = await prisma.media.findUnique({
      where: { id: mediaId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            name: true,
            email: true,
          },
        },
      },
    })

    if (!media) {
      return NextResponse.json({ error: 'Media not found' }, { status: 404 })
    }

    const price = (media as any).price
    if (!price || price <= 0) {
      return NextResponse.json({ error: 'This media is free' }, { status: 400 })
    }

    // Check if user already purchased
    const existingPurchase = await prisma.purchase.findFirst({
      where: {
        buyerId: session.user.id,
        mediaId: media.id,
        status: 'completed',
      },
    })

    if (existingPurchase) {
      return NextResponse.json({ error: 'You already own this media' }, { status: 400 })
    }

    // Create Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: session.user.email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: media.title,
              description: `${media.type} by ${media.user.name || media.user.username}`,
              images: media.thumbnailUrl ? [media.thumbnailUrl] : [],
            },
            unit_amount: formatAmountForStripe(price),
          },
          quantity: 1,
        },
      ],
      metadata: {
        mediaId: media.id,
        buyerId: session.user.id,
        sellerId: media.user.id,
        mediaTitle: media.title,
      },
      success_url: `${process.env.NEXTAUTH_URL}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/media/${media.id}`,
    })

    // Create pending purchase record
    await prisma.purchase.create({
      data: {
        amount: price,
        currency: 'usd',
        status: 'pending',
        stripeSessionId: checkoutSession.id,
        buyerId: session.user.id,
        mediaId: media.id,
        sellerId: media.user.id,
      },
    })

    return NextResponse.json({ 
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
    })
  } catch (error: any) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}






