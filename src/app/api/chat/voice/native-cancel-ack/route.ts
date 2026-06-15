import { NextResponse } from 'next/server'
import { recordNativeCancelAck, logVoipPipelineSummary } from '@/lib/voipCallTrace'
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

  if (!callId) {
    return NextResponse.json({ error: 'callId required' }, { status: 400 })
  }
  if (!ALLOWED_SOURCES.has(source)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 })
  }

  const hasDeclineToken = Boolean(token)
  if (hasDeclineToken && !verifyVoiceCallDeclineToken(callId, token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  console.info('[VoIP] iPhone cancel ack', { callId, source, hasDeclineToken })
  await recordNativeCancelAck({ callId, source, hasDeclineToken })
  void logVoipPipelineSummary(callId, `cancel_ack_${source}`)

  return NextResponse.json({ ok: true })
}
