import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordNativeIosTrace, logVoipPipelineSummary } from '@/lib/voipCallTrace'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'
import { verifyVoiceCallDeclineToken } from '@/lib/voiceCallDeclineToken'

export const dynamic = 'force-dynamic'

/**
 * Native clients report call/media pipeline events.
 * Auth: per-call decline token (lock-screen) OR signed-in session party to the call.
 */
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

    if (!callId || !event) {
      return NextResponse.json({ error: 'callId and event required' }, { status: 400 })
    }

    if (token) {
      if (!verifyVoiceCallDeclineToken(callId, token)) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
      }
    } else {
      const session = await getServerSession(authOptions)
      const userId = session?.user?.id
      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      const call = await prisma.voiceCall.findFirst({
        where: {
          id: callId,
          OR: [{ callerId: userId }, { calleeId: userId }],
        },
        select: { id: true },
      })
      if (!call) {
        return NextResponse.json({ error: 'Call not found' }, { status: 404 })
      }
    }

    await recordNativeIosTrace({ callId, event, source, detail })
    const detailSuffix =
      detail && Object.keys(detail).length > 0 ? ` ${JSON.stringify(detail).slice(0, 180)}` : ''
    console.info(`[VoIP] native trace ${event} call=${callId} source=${source}${detailSuffix}`)
    void logVoipPipelineSummary(callId, `native_trace_${event}`)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('native-trace error:', error)
    return NextResponse.json({ error: 'Failed to record trace' }, { status: 500 })
  }
}
