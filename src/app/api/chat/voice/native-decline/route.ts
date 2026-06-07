import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'
import { verifyVoiceCallDeclineToken } from '@/lib/voiceCallDeclineToken'

export const dynamic = 'force-dynamic'

/** CallKit decline from lock screen (no browser session). Secured by per-call HMAC token. */
export async function POST(request: Request) {
  let body: { callId?: string; token?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const callId = normalizeVoiceCallId(body.callId)
  const token = (body.token || '').trim()
  if (!callId || !token) {
    return NextResponse.json({ error: 'callId and token required' }, { status: 400 })
  }
  if (!verifyVoiceCallDeclineToken(callId, token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const call = await prisma.voiceCall.findUnique({
    where: { id: callId },
    select: { id: true, callerId: true, calleeId: true, status: true },
  })
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }
  if (call.status !== 'ringing') {
    return NextResponse.json({ ok: true, alreadyEnded: true })
  }

  await prisma.voiceCall.update({
    where: { id: callId },
    data: { status: 'rejected', endedAt: new Date() },
  })

  await prisma.voiceCallSignal.create({
    data: {
      callId,
      fromUserId: call.calleeId,
      toUserId: call.callerId,
      type: 'reject',
      payload: '{}',
    },
  })

  console.info('[VoIP] native CallKit decline synced for call', callId)
  return NextResponse.json({ ok: true })
}
