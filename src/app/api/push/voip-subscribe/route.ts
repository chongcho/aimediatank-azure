import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNativePushRegisterKey } from '@/lib/voipPushNativeRegisterKey'

export const dynamic = 'force-dynamic'

function normalizePlatform(raw: string | undefined): string {
  const platform = (raw || 'ios').trim().toLowerCase()
  return platform === 'android' ? 'android' : 'ios'
}

function isValidNativePushToken(token: string, platform: string): boolean {
  if (!token) return false
  if (platform === 'ios') {
    return /^[0-9a-f]{32,}$/i.test(token)
  }
  // FCM registration tokens (case-sensitive, include ':' and other chars)
  return token.length >= 80 && token.length <= 4096
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { token?: string; platform?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const platform = normalizePlatform(body.platform)
  const token =
    platform === 'ios' ? (body.token || '').trim().toLowerCase() : (body.token || '').trim()

  if (!isValidNativePushToken(token, platform)) {
    return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })
  }

  const userAgent = request.headers.get('user-agent')

  await prisma.$transaction([
    prisma.voipPushToken.upsert({
      where: { token },
      create: {
        userId: session.user.id,
        token,
        platform,
        userAgent,
      },
      update: {
        userId: session.user.id,
        platform,
        userAgent,
      },
    }),
    prisma.voipPushToken.deleteMany({
      where: {
        userId: session.user.id,
        platform,
        token: { not: token },
      },
    }),
    ...(platform === 'android'
      ? [
          prisma.pushSubscription.deleteMany({
            where: { userId: session.user.id },
          }),
        ]
      : []),
  ])

  if (platform === 'android') {
    console.info('[NativePush] cleared Web Push subscriptions for Android native user', session.user.id)
  }

  console.info(`[NativePush] ${platform} token registered for user`, session.user.id)

  const nativeRegisterKey =
    platform === 'ios' ? createNativePushRegisterKey(session.user.id) : null

  return NextResponse.json({
    ok: true,
    ...(nativeRegisterKey ? { nativeRegisterKey } : {}),
  })
}

export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.voipPushToken.deleteMany({
    where: { userId: session.user.id },
  })

  return NextResponse.json({ ok: true })
}
