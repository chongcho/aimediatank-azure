import { localeTagFromUserLocation } from '@/lib/localeFromLocation'
import { prisma } from '@/lib/prisma'
import { talkChatT } from '@/messages/talkChatStrings'

/** Resolve UI language tag for a user (profile location → same rules as web language mode). */
export async function resolveUserUiLocale(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { location: true },
  })
  return localeTagFromUserLocation(user?.location)
}

/** Localized "Call from {name}" / "Calling {name}" for spoken rings and VoIP/FCM payloads. */
export function formatVoiceCallAnnouncementText(
  kind: 'incoming' | 'outgoing',
  localeTag: string | undefined,
  displayName: string,
): string {
  const name = displayName.trim() || 'AiMediaTank'
  const key = kind === 'incoming' ? 'voiceIncomingCall' : 'voiceCalling'
  return talkChatT(localeTag, key).replace(/\{name\}/g, name)
}
