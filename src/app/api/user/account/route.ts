import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getStripe, isStripeConfigured } from '@/lib/stripe'
import { isSelfServiceAccountDeactivationEnabled } from '@/lib/selfServiceAccountDeactivation'

export const dynamic = 'force-dynamic'

type AccountBody = { confirmUsername?: unknown; password?: unknown; restore?: unknown }

async function parseJsonBody(request: Request): Promise<AccountBody | null> {
  try {
    const text = await request.text()
    if (!text) return {}
    return JSON.parse(text) as AccountBody
  } catch {
    return null
  }
}

/**
 * Soft-deactivate the signed-in user's account (hide content from feed/search; stay signed in).
 * Requires exact username confirmation; password if the account has a credentials password.
 * Cancels an active Stripe subscription when configured.
 */
export async function PATCH(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await parseJsonBody(request)
    if (body === null) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (body.restore === true) {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { id: true, accountDeactivatedAt: true },
      })
      if (!user) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      if (!user.accountDeactivatedAt) {
        return NextResponse.json({ error: 'Account is not deactivated.' }, { status: 400 })
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { accountDeactivatedAt: null },
      })
      return NextResponse.json({ success: true })
    }

    if (!(await isSelfServiceAccountDeactivationEnabled())) {
      return NextResponse.json(
        { error: 'Account deactivation has been disabled by an administrator.' },
        { status: 403 },
      )
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
        role: true,
        stripeSubscriptionId: true,
        accountDeactivatedAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (user.accountDeactivatedAt) {
      return NextResponse.json({ error: 'Account is already deactivated.' }, { status: 400 })
    }

    if (user.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Admin accounts cannot be deactivated here. Contact support.' },
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
        console.error('Stripe subscription cancel on account deactivate:', e)
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        accountDeactivatedAt: new Date(),
        stripeSubscriptionId: null,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deactivating account:', error)
    return NextResponse.json({ error: 'Failed to deactivate account' }, { status: 500 })
  }
}
