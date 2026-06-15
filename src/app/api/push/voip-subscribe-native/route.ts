import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyNativePushRegisterKey } from '@/lib/voipPushNativeRegisterKey'
import {
  isValidVoipPushToken,
  normalizeVoipPushPlatform,
  normalizeVoipPushToken,
  registerVoipPushTokenForUser,
} from '@/lib/voipPushTokenRegister'

export const dynamic = 'force-dynamic'

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
  const platform = normalizeVoipPushPlatform(body.platform)
  const token = normalizeVoipPushToken(body.token || '', platform)

  if (!userId || !registerKey) {
    return NextResponse.json({ error: 'userId and registerKey required' }, { status: 400 })
  }
  if (!verifyNativePushRegisterKey(userId, registerKey)) {
    return NextResponse.json({ error: 'Invalid registerKey' }, { status: 401 })
  }
  if (!isValidVoipPushToken(token, platform)) {
    return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, accountDeactivatedAt: true },
  })
  if (!user || user.accountDeactivatedAt) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const { changed } = await registerVoipPushTokenForUser({
    userId,
    token,
    platform,
    userAgent: 'ios-native-pushkit',
  })

  if (changed) {
    console.info(
      `[NativePush] native ${platform} token registered for user ${userId} prefix=${token.slice(0, 8)}…`,
    )
  }

  return NextResponse.json({ ok: true, unchanged: !changed })
}
