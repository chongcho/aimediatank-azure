import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createNativePushRegisterKey } from '@/lib/voipPushNativeRegisterKey'
import {
  isValidVoipPushToken,
  normalizeVoipPushPlatform,
  normalizeVoipPushToken,
  registerVoipPushTokenForUser,
} from '@/lib/voipPushTokenRegister'

export const dynamic = 'force-dynamic'

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

  const platform = normalizeVoipPushPlatform(body.platform)
  const token = normalizeVoipPushToken(body.token || '', platform)

  if (!isValidVoipPushToken(token, platform)) {
    return NextResponse.json({ error: 'Invalid push token' }, { status: 400 })
  }

  const userAgent = request.headers.get('user-agent')

  const { changed } = await registerVoipPushTokenForUser({
    userId: session.user.id,
    token,
    platform,
    userAgent,
  })

  if (platform === 'android' && changed) {
    await prisma.pushSubscription.deleteMany({
      where: { userId: session.user.id },
    })
    console.info('[NativePush] cleared Web Push subscriptions for Android native user', session.user.id)
  }

  if (changed) {
    console.info(`[NativePush] ${platform} token registered for user`, session.user.id)
  }

  const nativeRegisterKey =
    platform === 'ios' ? createNativePushRegisterKey(session.user.id) : null

  return NextResponse.json({
    ok: true,
    unchanged: !changed,
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
