import { NextResponse } from 'next/server'
import { getVoipCallTrace } from '@/lib/voipCallTrace'
import { getWebPushTrace } from '@/lib/webPushTrace'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'
import { verifyVoiceCallDeclineToken } from '@/lib/voiceCallDeclineToken'

export const dynamic = 'force-dynamic'

/** Debug: VoIP cancel + Web Push ring delivery trace. Secured by per-call decline token. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const callId = normalizeVoiceCallId(searchParams.get('callId'))
  const token = (searchParams.get('token') || '').trim()

  if (!callId || !token) {
    return NextResponse.json({ error: 'callId and token required' }, { status: 400 })
  }
  if (!verifyVoiceCallDeclineToken(callId, token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const [voipTrace, webPushTrace] = await Promise.all([
    getVoipCallTrace(callId),
    getWebPushTrace(callId),
  ])

  if (!voipTrace && !webPushTrace) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  return NextResponse.json({
    voip: voipTrace,
    webPush: webPushTrace,
  })
}