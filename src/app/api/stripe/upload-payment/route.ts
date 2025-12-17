import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Upload costs per plan (in cents)
const UPLOAD_COSTS: Record<string, number> = {
  BASIC: 100, // $1.00
  ADVANCED: 50, // $0.50
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

    // Get upload data from request body
    const body = await request.json()
    const {
      title,
      description,
      type,
      url,
      thumbnailUrl,
      aiTool,
      aiPrompt,
      price,
      isPublic = true,
    } = body

    // Validate required fields
    if (!title || !type || !url) {
      return NextResponse.json(
        { error: 'Missing required upload data (title, type, url)' },
        { status: 400 }
      )
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

    // Create pending upload record (expires in 1 hour)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now
    
    const pendingUpload = await prisma.pendingUpload.create({
      data: {
        title,
        description: description || '',
        type,
        url,
        thumbnailUrl: thumbnailUrl || null,
        aiTool: aiTool || null,
        aiPrompt: aiPrompt || null,
        price: price ? parseFloat(price) : null,
        isPublic,
        userId: session.user.id,
        expiresAt,
      },
    })

    console.log(`Created pending upload ${pendingUpload.id} for user ${session.user.id}`)

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
              name: `Upload: ${title}`,
              description: `Upload fee for "${title}" - ${user.membershipType} Plan`,
            },
            unit_amount: uploadCost,
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXTAUTH_URL || 'https://aimediatank.com'}/upload?payment=success&pending=${pendingUpload.id}`,
      cancel_url: `${process.env.NEXTAUTH_URL || 'https://aimediatank.com'}/upload?payment=cancelled`,
      metadata: {
        userId: session.user.id,
        type: 'upload_fee',
        pendingUploadId: pendingUpload.id,
        mediaTitle: title,
      },
    })

    // Update pending upload with Stripe session ID
    await prisma.pendingUpload.update({
      where: { id: pendingUpload.id },
      data: { stripeSessionId: checkoutSession.id },
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
