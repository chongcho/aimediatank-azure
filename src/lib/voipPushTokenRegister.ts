import { prisma } from '@/lib/prisma'

export type VoipPushPlatform = 'ios' | 'android' | 'ios_alert'

export function normalizeVoipPushPlatform(raw: string | undefined): VoipPushPlatform {
  const platform = (raw || 'ios').trim().toLowerCase()
  if (platform === 'android') return 'android'
  if (platform === 'ios_alert' || platform === 'ios-alert') return 'ios_alert'
  return 'ios'
}

export function isValidVoipPushToken(token: string, platform: VoipPushPlatform): boolean {
  if (!token) return false
  if (platform === 'ios' || platform === 'ios_alert') {
    return /^[0-9a-f]{32,}$/i.test(token)
  }
  return token.length >= 80 && token.length <= 4096
}

export function normalizeVoipPushToken(token: string, platform: VoipPushPlatform): string {
  return platform === 'ios' || platform === 'ios_alert'
    ? token.trim().toLowerCase()
    : token.trim()
}

/** Upsert canonical token for user+platform; drop stale rows. Returns whether DB changed. */
export async function registerVoipPushTokenForUser(params: {
  userId: string
  token: string
  platform: VoipPushPlatform
  userAgent?: string | null
}): Promise<{ changed: boolean; token: string; seen?: boolean }> {
  const token = normalizeVoipPushToken(params.token, params.platform)
  const { userId, platform } = params

  const unchanged = await prisma.voipPushToken.findFirst({
    where: { userId, platform, token },
    select: { id: true },
  })
  if (unchanged) {
    const isNativeHeartbeat = Boolean(params.userAgent?.includes('native'))
    if (isNativeHeartbeat) {
      await prisma.voipPushToken.updateMany({
        where: { userId, platform, token },
        data: { updatedAt: new Date(), userAgent: params.userAgent ?? null },
      })
    }
    return { changed: false, token, seen: isNativeHeartbeat }
  }

  await prisma.$transaction([
    prisma.voipPushToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform,
        userAgent: params.userAgent ?? null,
      },
      update: {
        userId,
        platform,
        userAgent: params.userAgent ?? null,
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

  return { changed: true, token }
}
