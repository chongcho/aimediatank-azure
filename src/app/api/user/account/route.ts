import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail, generateAccountDeletedEmail } from '@/lib/email'
import { getStripe, isStripeConfigured } from '@/lib/stripe'

export const dynamic = 'force-dynamic'

/**
 * Permanently delete the signed-in user's account (GDPR-style self-service).
 * Requires exact username confirmation; password if the account has a credentials password.
 */
export async function DELETE(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { confirmUsername?: unknown; password?: unknown } = {}
    try {
      const text = await request.text()
      if (text) body = JSON.parse(text) as typeof body
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const confirmUsername =
      typeof body.confirmUsername === 'string' ? body.confirmUsername.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        username: true,
        password: true,
        email: true,
        name: true,
        role: true,
        stripeSubscriptionId: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Admin accounts cannot be deleted here. Contact support.' },
        { status: 403 },
      )
    }

    if (confirmUsername !== user.username) {
      return NextResponse.json({ error: 'Username does not match your account.' }, { status: 400 })
    }

    if (user.password && user.password.length > 0) {
      if (!password) {
        return NextResponse.json({ error: 'Password is required.' }, { status: 400 })
      }
      const ok = await bcrypt.compare(password, user.password)
      if (!ok) {
        return NextResponse.json({ error: 'Invalid password.' }, { status: 400 })
      }
    }

    if (user.stripeSubscriptionId && isStripeConfigured()) {
      try {
        const stripe = getStripe()
        await stripe.subscriptions.cancel(user.stripeSubscriptionId)
      } catch (e) {
        console.error('Stripe subscription cancel on account delete:', e)
      }
    }

    const recipientEmail = user.email
    const recipientName = user.name || user.username

    await prisma.user.delete({ where: { id: user.id } })

    try {
      await sendEmail({
        to: recipientEmail,
        subject: '🗑️ Your AI Media Tank (AiM) Account Has Been Deleted',
        html: generateAccountDeletedEmail(recipientName || 'User', 'At your request'),
      })
    } catch (emailError) {
      console.error('Account deletion confirmation email failed:', emailError)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting account:', error)
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 })
  }
}
