import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getIceServers } from '@/lib/voiceCallConfig'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'
import { verifyVoiceCallDeclineToken } from '@/lib/voiceCallDeclineToken'

export const dynamic = 'force-dynamic'

function verifyToken(callId: string, token: string) {
  if (!callId || !token) return false
  return verifyVoiceCallDeclineToken(callId, token)
}

/** Lock-screen CallKit bootstrap without browser session (offer + caller + ICE). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const callId = normalizeVoiceCallId(searchParams.get('callId'))
  const token = (searchParams.get('token') || '').trim()

  if (!callId || !token) {
    return NextResponse.json({ error: 'callId and token required' }, { status: 400 })
  }
  if (!verifyToken(callId, token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const call = await prisma.voiceCall.findUnique({
    where: { id: callId },
    include: {
      caller: { select: { id: true, username: true, name: true, avatar: true } },
    },
  })
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  const offerSignal = await prisma.voiceCallSignal.findFirst({
    where: { callId, type: 'offer', consumedAt: null },
    orderBy: { createdAt: 'desc' },
  })

  if (!offerSignal) {
    console.warn(`[VoIP] native-callkit bootstrap call=${callId} offer=missing status=${call.status}`)
  }

  const iceSignals = await prisma.voiceCallSignal.findMany({
    where: { callId, type: 'ice', consumedAt: null, toUserId: call.calleeId },
    orderBy: { createdAt: 'asc' },
    take: 50,
  })

  const iceCandidates = iceSignals.map((row) => JSON.parse(row.payload))
  const iceServers = getIceServers()
  if (iceCandidates.length > 0) {
    console.info(
      `[VoIP] native-callkit bootstrap call=${callId} ice=${iceCandidates.length} turn=${iceServers.some((s) => String(s.urls ?? '').includes('turn:'))}`,
    )
  }

  return NextResponse.json({
    status: call.status,
    caller: call.caller,
    offer: offerSignal ? JSON.parse(offerSignal.payload) : null,
    iceCandidates,
    iceServers,
  })
}

/** Accept or send WebRTC signals from CallKit without browser cookies. */
export async function POST(request: Request) {
  let body: {
    action?: string
    callId?: string
    token?: string
    type?: string
    payload?: Record<string, unknown>
  }
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
  if (!verifyToken(callId, token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const call = await prisma.voiceCall.findUnique({
    where: { id: callId },
    select: { id: true, callerId: true, calleeId: true, status: true },
  })
  if (!call) {
    return NextResponse.json({ error: 'Call not found' }, { status: 404 })
  }

  if (body.action === 'accept') {
    if (call.status === 'ringing') {
      await prisma.voiceCall.update({
        where: { id: callId },
        data: { status: 'active' },
      })
    }
    return NextResponse.json({ ok: true, status: call.status === 'ringing' ? 'active' : call.status })
  }

  if (body.action === 'signal') {
    const { type, payload } = body
    if (!type) {
      return NextResponse.json({ error: 'type required' }, { status: 400 })
    }
    if (call.status !== 'ringing' && call.status !== 'active') {
      return NextResponse.json({ error: 'Call is not active' }, { status: 409 })
    }

    await prisma.voiceCallSignal.create({
      data: {
        callId,
        fromUserId: call.calleeId,
        toUserId: call.callerId,
        type,
        payload: JSON.stringify(payload ?? {}),
      },
    })

    if (type === 'answer' || type === 'ice') {
      console.info(`[VoIP] native-callkit signal call=${callId} type=${type} to=caller`)
    }

    if (type === 'answer') {
      await prisma.voiceCallSignal.updateMany({
        where: { callId, type: 'offer', consumedAt: null },
        data: { consumedAt: new Date() },
      })
    }

    return NextResponse.json({ ok: true })
  }

  if (body.action === 'end') {
    const finalStatus = call.status === 'ringing' ? 'rejected' : 'ended'
    await prisma.voiceCall.update({
      where: { id: callId },
      data: { status: finalStatus, endedAt: new Date() },
    })
    await prisma.voiceCallSignal.create({
      data: {
        callId,
        fromUserId: call.calleeId,
        toUserId: call.callerId,
        type: 'hangup',
        payload: '{}',
      },
    })
    console.info(`[VoIP] native-callkit end call=${callId} status=${finalStatus}`)
    return NextResponse.json({ ok: true, status: finalStatus })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
