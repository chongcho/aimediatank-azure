import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  sendVoiceCallDismissPushToUser,
  sendVoiceCallRingPushBurstToUser,
} from '@/lib/webPush'
import { sendNativeCallCancelPushBurstToUser, sendNativeCallPushToUser } from '@/lib/nativeCallPush'
import { calleeHasAndroidNativeCallToken, calleeHasIosNativeCallToken } from '@/lib/nativePushRouting'
import { plannedVoipCancelPushAttempts } from '@/lib/voipPush'
import { recordVoipCancelBurst, formatCalleeIosTokenSummary, logVoipPipelineSummary } from '@/lib/voipCallTrace'
import { normalizeVoiceCallId } from '@/lib/voiceCallId'

export const dynamic = 'force-dynamic'

const ACTIVE_STATUSES = ['ringing', 'active'] as const

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function requireSubscriber(sessionUser: { id: string; role?: string } | undefined) {
  if (!sessionUser?.id) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (sessionUser.role !== 'SUBSCRIBER' && sessionUser.role !== 'ADMIN') {
    return { error: NextResponse.json({ error: 'Only subscribers can use voice calls' }, { status: 403 }) }
  }
  return { userId: sessionUser.id }
}

async function getCallForUser(callIdRaw: string, userId: string) {
  const callId = normalizeVoiceCallId(callIdRaw)
  if (!callId) return null
  return prisma.voiceCall.findFirst({
    where: {
      id: callId,
      OR: [{ callerId: userId }, { calleeId: userId }],
    },
    include: {
      caller: { select: { id: true, username: true, name: true, avatar: true } },
      callee: { select: { id: true, username: true, name: true, avatar: true } },
    },
  })
}

async function cleanupOldSignals() {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000)
  await prisma.voiceCallSignal.deleteMany({
    where: { createdAt: { lt: cutoff } },
  })
}

/** End ringing/active rows left behind when WebRTC or the client fails without calling `end`. */
async function expireStaleVoiceCalls() {
  const now = new Date()
  const ringingCutoff = new Date(now.getTime() - 60_000)
  const activeCutoff = new Date(now.getTime() - 4 * 60 * 60 * 1000)

  const expiredRinging = await prisma.voiceCall.findMany({
    where: { status: 'ringing', createdAt: { lt: ringingCutoff } },
    select: { id: true },
  })

  await prisma.voiceCall.updateMany({
    where: { status: 'ringing', createdAt: { lt: ringingCutoff } },
    data: { status: 'missed', endedAt: now },
  })
  for (const call of expiredRinging) {
    void logVoipPipelineSummary(call.id, 'auto_expire_60s')
  }

  await prisma.voiceCall.updateMany({
    where: { status: 'active', createdAt: { lt: activeCutoff } },
    data: { status: 'ended', endedAt: now },
  })
}

/** Caller abandoned an outbound ring — allow placing a new call. */
async function clearCallerRinging(userId: string) {
  const staleRinging = await prisma.voiceCall.findMany({
    where: { callerId: userId, status: 'ringing' },
    select: { id: true, calleeId: true },
  })
  if (staleRinging.length === 0) return

  const endedAt = new Date()
  await prisma.voiceCall.updateMany({
    where: { callerId: userId, status: 'ringing' },
    data: { status: 'missed', endedAt },
  })

  for (const call of staleRinging) {
    try {
      await sendNativeCallCancelPushBurstToUser(call.calleeId, call.id)
      await sendVoiceCallDismissPushToUser(call.calleeId, call.id, userId)
    } catch (err) {
      console.error(`VoIP cancel push failed while clearing stale ring ${call.id}:`, err)
    }
  }
}

// GET - Poll for incoming calls and unconsumed WebRTC signals
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    const auth = await requireSubscriber(session?.user)
    if ('error' in auth) return auth.error
    const userId = auth.userId

    await cleanupOldSignals()
    await expireStaleVoiceCalls()

    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since')
    const sinceDate = since ? new Date(since) : new Date(0)

    const incomingCalls = await prisma.voiceCall.findMany({
      where: {
        calleeId: userId,
        status: 'ringing',
        createdAt: { gt: sinceDate },
      },
      include: {
        caller: { select: { id: true, username: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: 5,
    })

    const signals = await prisma.voiceCallSignal.findMany({
      where: {
        toUserId: userId,
        consumedAt: null,
        createdAt: { gt: sinceDate },
      },
      orderBy: { createdAt: 'asc' },
      take: 50,
    })

    const consumableIds = signals.filter((s) => s.type !== 'offer').map((s) => s.id)
    if (consumableIds.length > 0) {
      await prisma.voiceCallSignal.updateMany({
        where: { id: { in: consumableIds } },
        data: { consumedAt: new Date() },
      })
    }

    const activeCall = await prisma.voiceCall.findFirst({
      where: {
        OR: [{ callerId: userId }, { calleeId: userId }],
        status: { in: [...ACTIVE_STATUSES] },
      },
      include: {
        caller: { select: { id: true, username: true, name: true, avatar: true } },
        callee: { select: { id: true, username: true, name: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    })

    const endedCalls = await prisma.voiceCall.findMany({
      where: {
        OR: [{ callerId: userId }, { calleeId: userId }],
        status: { in: ['rejected', 'missed', 'ended'] },
        endedAt: { gt: sinceDate },
      },
      select: { id: true, status: true, endedAt: true },
      orderBy: { endedAt: 'asc' },
      take: 10,
    })

    return NextResponse.json({
      incomingCalls: incomingCalls.map((c) => ({
        id: c.id,
        caller: c.caller,
        conversationId: c.conversationId,
        createdAt: c.createdAt.toISOString(),
      })),
      signals: signals.map((s) => ({
        id: s.id,
        callId: s.callId,
        fromUserId: s.fromUserId,
        type: s.type,
        payload: JSON.parse(s.payload),
        createdAt: s.createdAt.toISOString(),
      })),
      activeCall: activeCall
        ? {
            id: activeCall.id,
            status: activeCall.status,
            caller: activeCall.caller,
            callee: activeCall.callee,
            conversationId: activeCall.conversationId,
            createdAt: activeCall.createdAt.toISOString(),
          }
        : null,
      endedCalls: endedCalls.map((c) => ({
        id: c.id,
        status: c.status,
        endedAt: c.endedAt?.toISOString() ?? null,
      })),
    })
  } catch (error) {
    console.error('Voice call GET error:', error)
    return NextResponse.json({ error: 'Failed to poll voice calls' }, { status: 500 })
  }
}

// POST - Initiate call, send signal, accept, reject, or end
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    const auth = await requireSubscriber(session?.user)
    if ('error' in auth) return auth.error
    const userId = auth.userId

    const body = await request.json()
    const { action } = body

    if (action === 'initiate') {
      const { calleeId, conversationId } = body
      if (!calleeId || typeof calleeId !== 'string') {
        return NextResponse.json({ error: 'calleeId is required' }, { status: 400 })
      }
      if (calleeId === userId) {
        return NextResponse.json({ error: 'Cannot call yourself' }, { status: 400 })
      }

      await cleanupOldSignals()
      await expireStaleVoiceCalls()
      await clearCallerRinging(userId)

      const callee = await prisma.user.findUnique({
        where: { id: calleeId },
        select: { id: true, accountDeactivatedAt: true },
      })
      if (!callee || callee.accountDeactivatedAt) {
        return NextResponse.json({ error: 'User not available' }, { status: 404 })
      }

      const existing = await prisma.voiceCall.findFirst({
        where: {
          OR: [{ callerId: userId }, { calleeId: userId }],
          status: { in: [...ACTIVE_STATUSES] },
        },
      })
      if (existing) {
        return NextResponse.json({ error: 'Already in a call' }, { status: 409 })
      }

      const busyCallee = await prisma.voiceCall.findFirst({
        where: {
          OR: [{ callerId: calleeId }, { calleeId: calleeId }],
          status: { in: [...ACTIVE_STATUSES] },
        },
      })
      if (busyCallee) {
        return NextResponse.json({ error: 'User is busy' }, { status: 409 })
      }

      const call = await prisma.voiceCall.create({
        data: {
          callerId: userId,
          calleeId,
          conversationId: conversationId || null,
          status: 'ringing',
        },
        include: {
          caller: { select: { id: true, username: true, name: true, avatar: true } },
          callee: { select: { id: true, username: true, name: true, avatar: true } },
        },
      })

      const callerLabel = call.caller.name || call.caller.username
      const nativeAndroidCallee = await calleeHasAndroidNativeCallToken(calleeId)
      if (!nativeAndroidCallee) {
        void sendVoiceCallRingPushBurstToUser(calleeId, {
          type: 'voice_call',
          callId: call.id,
          caller: call.caller,
          title: 'Incoming voice call',
          body: `${callerLabel} is calling on AiMediaTank`,
          url: `/?openChat=1&voiceIncoming=1&callId=${encodeURIComponent(call.id)}`,
        }).catch((err) => console.error('Voice call push failed:', err))
      } else {
        console.info('[WebPush] skipped ring burst: callee uses Android native FCM token')
      }

      const nativePushPayload = {
        callId: call.id,
        caller: call.caller,
        displayName: callerLabel,
        handle: call.caller.username || call.caller.id,
      }

      const nativePushTask = (async () => {
        const hasIosToken = await calleeHasIosNativeCallToken(calleeId)
        const tokenSummary = await formatCalleeIosTokenSummary(calleeId)
        if (!hasIosToken) {
          console.warn(
            `[VoIP] callee ${calleeId} has no iOS PushKit token — lock-screen CallKit requires TestFlight app sign-in`,
          )
        } else {
          console.info(`[VoIP] call=${call.id} initiate callee=${calleeId} token=${tokenSummary}`)
        }
        await sendNativeCallPushToUser(calleeId, nativePushPayload, userId)
        await sleep(4000)
        await logVoipPipelineSummary(call.id, 'after_incoming_burst')
      })()

      try {
        // Await iOS burst (~2.7s) so Azure does not freeze before retry pushes are sent.
        await Promise.race([nativePushTask, sleep(3200)])
      } catch (err) {
        console.error('Native call push failed:', err)
      }
      void nativePushTask.catch((err) => console.error('Native call push background error:', err))

      return NextResponse.json({
        call: {
          id: call.id,
          status: call.status,
          caller: call.caller,
          callee: call.callee,
          conversationId: call.conversationId,
        },
      })
    }

    if (action === 'signal') {
      const { callId, type, payload } = body
      if (!callId || !type) {
        return NextResponse.json({ error: 'callId and type are required' }, { status: 400 })
      }

      const call = await getCallForUser(callId, userId)
      if (!call) {
        return NextResponse.json({ error: 'Call not found' }, { status: 404 })
      }
      if (!ACTIVE_STATUSES.includes(call.status as (typeof ACTIVE_STATUSES)[number])) {
        return NextResponse.json({ error: 'Call is not active' }, { status: 409 })
      }

      const peerId = call.callerId === userId ? call.calleeId : call.callerId
      await prisma.voiceCallSignal.create({
        data: {
          callId: call.id,
          fromUserId: userId,
          toUserId: peerId,
          type,
          payload: JSON.stringify(payload ?? {}),
        },
      })

      if (type === 'answer') {
        await prisma.voiceCallSignal.updateMany({
          where: { callId: call.id, type: 'offer', consumedAt: null },
          data: { consumedAt: new Date() },
        })
      }

      return NextResponse.json({ ok: true })
    }

    if (action === 'accept') {
      const { callId } = body
      const call = await getCallForUser(callId, userId)
      if (!call) {
        return NextResponse.json({ error: 'Call not found' }, { status: 404 })
      }
      if (call.calleeId !== userId) {
        return NextResponse.json({ error: 'Only callee can accept' }, { status: 403 })
      }
      if (call.status !== 'ringing') {
        return NextResponse.json({ error: 'Call is not ringing' }, { status: 409 })
      }

      await prisma.voiceCall.update({
        where: { id: call.id },
        data: { status: 'active' },
      })

      void sendVoiceCallDismissPushToUser(userId, call.id, userId).catch((err) =>
        console.error('Voice call dismiss push failed:', err),
      )

      return NextResponse.json({ ok: true })
    }

    if (action === 'reject') {
      const { callId } = body
      const call = await getCallForUser(callId, userId)
      if (!call) {
        return NextResponse.json({ error: 'Call not found' }, { status: 404 })
      }
      if (call.calleeId !== userId) {
        return NextResponse.json({ error: 'Only callee can reject' }, { status: 403 })
      }

      await prisma.voiceCall.update({
        where: { id: call.id },
        data: { status: 'rejected', endedAt: new Date() },
      })

      await prisma.voiceCallSignal.create({
        data: {
          callId: call.id,
          fromUserId: userId,
          toUserId: call.callerId,
          type: 'reject',
          payload: '{}',
        },
      })

      void sendVoiceCallDismissPushToUser(userId, call.id, userId).catch((err) =>
        console.error('Voice call dismiss push failed:', err),
      )

      return NextResponse.json({ ok: true })
    }

    if (action === 'end') {
      const { callId } = body
      const call = await getCallForUser(callId, userId)
      if (!call) {
        return NextResponse.json({ error: 'Call not found' }, { status: 404 })
      }

      const peerId = call.callerId === userId ? call.calleeId : call.callerId
      const finalStatus =
        call.status === 'ringing' && call.calleeId === userId
          ? 'rejected'
          : call.status === 'ringing' && call.callerId === userId
            ? 'missed'
            : 'ended'

      await prisma.voiceCall.update({
        where: { id: call.id },
        data: { status: finalStatus, endedAt: new Date() },
      })

      await prisma.voiceCallSignal.create({
        data: {
          callId: call.id,
          fromUserId: userId,
          toUserId: peerId,
          type: 'hangup',
          payload: '{}',
        },
      })

      if (call.status === 'ringing' && call.callerId === userId) {
        try {
          await sendNativeCallCancelPushBurstToUser(peerId, call.id)
          await sendVoiceCallDismissPushToUser(peerId, call.id, userId)
          await recordVoipCancelBurst({
            callId: call.id,
            fromUserId: userId,
            toUserId: peerId,
            plannedAttempts: plannedVoipCancelPushAttempts(),
          })
          await logVoipPipelineSummary(call.id, 'caller_end_ring')
        } catch (err) {
          console.error('VoIP cancel push failed:', err)
        }
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Voice call POST error:', error)
    return NextResponse.json({ error: 'Voice call request failed' }, { status: 500 })
  }
}
