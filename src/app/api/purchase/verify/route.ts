import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session_id')

    if (!sessionId) {
      return NextResponse.json({ error: 'Session ID required' }, { status: 400 })
    }

    // Find purchase by session ID
    const purchase = await prisma.purchase.findFirst({
      where: { 
        stripeSessionId: sessionId,
        buyerId: session.user.id,
      },
      include: {
        media: {
          select: {
            id: true,
            title: true,
            type: true,
            url: true,
            thumbnailUrl: true,
          },
        },
      },
    })

    if (!purchase) {
      return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })
    }

    // If still pending, check with Stripe
    if (purchase.status === 'pending') {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2023-10-16',
      })

      const stripeSession = await stripe.checkout.sessions.retrieve(sessionId)
      
      if (stripeSession.payment_status === 'paid') {
        await prisma.purchase.update({
          where: { id: purchase.id },
          data: {
            status: 'completed',
            stripePaymentId: stripeSession.payment_intent as string,
            completedAt: new Date(),
          },
        })
        purchase.status = 'completed'
      }
    }

    return NextResponse.json({ purchase })
  } catch (error) {
    console.error('Error verifying purchase:', error)
    return NextResponse.json(
      { error: 'Failed to verify purchase' },
      { status: 500 }
    )
  }
}






