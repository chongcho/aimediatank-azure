import { NextResponse } from 'next/server'
import { recordWebPushDeviceAck } from '@/lib/webPushTrace'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'

export const dynamic = 'force-dynamic'

/** Service worker reports push received / notification shown (device-side delivery trace). */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const callId = normalizeVoiceCallId(body.callId)
    const event = typeof body.event === 'string' ? body.event.trim() : ''
    const detail = typeof body.detail === 'string' ? body.detail.slice(0, 500) : undefined

    if (!callId || !event) {
      return NextResponse.json({ error: 'callId and event required' }, { status: 400 })
    }

    await recordWebPushDeviceAck({ callId, event, detail })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('push-ack error:', error)
    return NextResponse.json({ error: 'Failed to record ack' }, { status: 500 })
  }
}
