import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe, formatAmountForStripe, isStripeConfigured } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST - Create checkout session for multiple media purchases
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

    // Get current user data (in case username was changed)
    const currentUser = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, email: true }
    })

    if (!currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { mediaIds } = await request.json()

    if (!mediaIds || !Array.isArray(mediaIds) || mediaIds.length === 0) {
      return NextResponse.json({ error: 'Media IDs are required' }, { status: 400 })
    }

    // Fetch all media items
    const mediaItems = await prisma.media.findMany({
      where: { 
        id: { in: mediaIds },
      },
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

    if (mediaItems.length === 0) {
      return NextResponse.json({ error: 'No media found' }, { status: 404 })
    }

    // Filter to only paid items that user doesn't own
    const existingPurchases = await prisma.purchase.findMany({
      where: {
        buyerId: session.user.id,
        mediaId: { in: mediaIds },
        status: 'completed',
      },
      select: { mediaId: true },
    })

    const purchasedIds = new Set(existingPurchases.map(p => p.mediaId))

    const itemsToPurchase = mediaItems.filter(media => {
      const price = (media as any).price
      return price && price > 0 && !purchasedIds.has(media.id) && media.userId !== session.user.id
    })

    if (itemsToPurchase.length === 0) {
      return NextResponse.json({ 
        error: 'No purchasable items. Items may be free, already owned, or your own content.' 
      }, { status: 400 })
    }

    // Calculate total
    const totalAmount = itemsToPurchase.reduce((sum, media) => sum + ((media as any).price || 0), 0)

    // Create line items for Stripe
    const lineItems = itemsToPurchase.map(media => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: media.title,
          description: `${media.type} by ${media.user.name || media.user.username}`,
          images: media.thumbnailUrl ? [media.thumbnailUrl] : [],
        },
        unit_amount: formatAmountForStripe((media as any).price),
      },
      quantity: 1,
    }))

    // Create Stripe checkout session
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: session.user.email || undefined,
      line_items: lineItems,
      metadata: {
        mediaIds: itemsToPurchase.map(m => m.id).join(','),
        buyerId: session.user.id,
        itemCount: itemsToPurchase.length.toString(),
      },
      success_url: `${process.env.NEXTAUTH_URL}/purchase/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXTAUTH_URL}/profile/${currentUser.username}`,
    })

    // Create pending purchase records for each item
    await Promise.all(
      itemsToPurchase.map(media =>
        prisma.purchase.create({
          data: {
            amount: (media as any).price,
            currency: 'usd',
            status: 'pending',
            stripeSessionId: checkoutSession.id,
            buyerId: session.user.id,
            mediaId: media.id,
            sellerId: media.user.id,
          },
        })
      )
    )

    return NextResponse.json({ 
      sessionId: checkoutSession.id,
      url: checkoutSession.url,
      itemCount: itemsToPurchase.length,
      totalAmount,
    })
  } catch (error: any) {
    console.error('Batch checkout error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}





