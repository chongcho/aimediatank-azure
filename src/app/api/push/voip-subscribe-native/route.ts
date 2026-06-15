import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyNativePushRegisterKey } from '@/lib/voipPushNativeRegisterKey'

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
  return token.length >= 80 && token.length <= 4096
}

/** PushKit token upload from native Swift (no WKWebView / session cookies required). */
export async function POST(request: Request) {
  let body: { userId?: string; token?: string; platform?: string; registerKey?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const userId = (body.userId || '').trim()
  const registerKey = (body.registerKey || '').trim()
  const platform = normalizePlatform(body.platform)
  const token =
    platform === 'ios' ? (body.token || '').trim().toLowerCase() : (body.token || '').trim()

  if (!userId || !registerKey) {
    return NextResponse.json({ error: 'userId and registerKey required' }, { status: 400 })
  }
  if (!verifyNativePushRegisterKey(userId, registerKey)) {
    return NextResponse.json({ error: 'Invalid registerKey' }, { status: 401 })
  }
  if (!isValidNativePushToken(token, platform)) {
    return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, accountDeactivatedAt: true },
  })
  if (!user || user.accountDeactivatedAt) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  await prisma.$transaction([
    prisma.voipPushToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform,
        userAgent: 'ios-native-pushkit',
      },
      update: {
        userId,
        platform,
        userAgent: 'ios-native-pushkit',
      },
    }),
    prisma.voipPushToken.deleteMany({
      where: {
        userId,
        platform,
        token: { not: token },
      },
    }),
  ])

  console.info(`[NativePush] native ${platform} token registered for user`, userId)
  return NextResponse.json({ ok: true })
}
