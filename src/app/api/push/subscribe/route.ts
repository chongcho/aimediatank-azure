import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

interface PushKeys {
  p256dh?: string
  auth?: string
}

interface PushSubscriptionJson {
  endpoint?: string
  keys?: PushKeys
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const subscription = body.subscription as PushSubscriptionJson | undefined
    const endpoint = subscription?.endpoint
    const p256dh = subscription?.keys?.p256dh
    const auth = subscription?.keys?.auth

    if (!endpoint || !p256dh || !auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    const userAgent = request.headers.get('user-agent')

    await prisma.$transaction([
      prisma.pushSubscription.upsert({
        where: { endpoint },
        create: {
          userId: session.user.id,
          endpoint,
          p256dh,
          auth,
          userAgent,
        },
        update: {
          userId: session.user.id,
          p256dh,
          auth,
          userAgent,
        },
      }),
      // Keep one registration per user — stale FCM endpoints can still return 201
      // without waking the phone's service worker (see voice call push traces).
      prisma.pushSubscription.deleteMany({
        where: {
          userId: session.user.id,
          endpoint: { not: endpoint },
        },
      }),
    ])

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Push subscribe error:', error)
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }
}
