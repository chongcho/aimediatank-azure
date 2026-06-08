import { NextResponse } from 'next/server'
import { getVoipCallTrace } from '@/lib/voipCallTrace'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'
import { verifyVoiceCallDeclineToken } from '@/lib/voiceCallDeclineToken'

export const dynamic = 'force-dynamic'

/** Debug: did the iPhone receive cancel (VoIP push or status poll)? Secured by per-call decline token. */
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

  const trace = await getVoipCallTrace(callId)
  if (!trace) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  return NextResponse.json(trace)
}
