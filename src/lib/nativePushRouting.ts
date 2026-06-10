import { prisma } from '@/lib/prisma'

/** Callee installed the Play native app and registered FCM for lock-screen calls. */
export async function calleeHasAndroidNativeCallToken(userId: string): Promise<boolean> {
  const count = await prisma.voipPushToken.count({
    where: { userId, platform: 'android' },
  })
  return count > 0
}
