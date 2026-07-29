import { prisma } from '@/lib/prisma'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'

/** True only while the call is still ringing — used to abort delayed ring-push retries after hangup. */
export async function voiceCallIsRinging(callId: string): Promise<boolean> {
  const normalized = normalizeVoiceCallId(callId)
  if (!normalized) return false
  const call = await prisma.voiceCall.findUnique({
    where: { id: normalized },
    select: { status: true },
  })
  return call?.status === 'ringing'
}
