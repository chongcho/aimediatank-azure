import { NextResponse } from 'next/server'
import { recordNativeIosTrace, logVoipPipelineSummary } from '@/lib/voipCallTrace'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'
import { verifyVoiceCallDeclineToken } from '@/lib/voiceCallDeclineToken'

export const dynamic = 'force-dynamic'

/** iOS PushKit bridge reports lock-screen call pipeline events (secured by per-call decline token). */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const callId = normalizeVoiceCallId(body.callId)
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const event = typeof body.event === 'string' ? body.event.trim().slice(0, 64) : ''
    const source =
      typeof body.source === 'string' ? body.source.trim().slice(0, 64) : 'ios_bridge'
    const detail =
      body.detail && typeof body.detail === 'object' && !Array.isArray(body.detail)
        ? (body.detail as Record<string, unknown>)
        : undefined

    if (!callId || !token || !event) {
      return NextResponse.json({ error: 'callId, token, and event required' }, { status: 400 })
    }
    if (!verifyVoiceCallDeclineToken(callId, token)) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
    }

    await recordNativeIosTrace({ callId, event, source, detail })
    console.info(`[VoIP] native trace ${event} call=${callId} source=${source}`)
    void logVoipPipelineSummary(callId, `native_trace_${event}`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('native-trace error:', error)
    return NextResponse.json({ error: 'Failed to record trace' }, { status: 500 })
  }
}
