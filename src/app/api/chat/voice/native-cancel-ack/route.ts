import { NextResponse } from 'next/server'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'
import { verifyVoiceCallDeclineToken } from '@/lib/voiceCallDeclineToken'

export const dynamic = 'force-dynamic'

const ALLOWED_SOURCES = new Set([
  'voip_cancel_push',
  'status_poll',
  'bridge_dismiss_request',
])

/** iPhone reports that it received/processed a caller-cancel dismiss (lock screen, no session). */
export async function POST(request: Request) {
  let body: { callId?: string; token?: string; source?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const callId = normalizeVoiceCallId(body.callId)
  const token = (body.token || '').trim()
  const source = (body.source || '').trim()

  if (!callId || !token) {
    return NextResponse.json({ error: 'callId and token required' }, { status: 400 })
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
  }
  if (!verifyVoiceCallDeclineToken(callId, token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  console.info('[VoIP] iPhone cancel ack', { callId, source })
  return NextResponse.json({ ok: true })
}
