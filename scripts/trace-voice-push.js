#!/usr/bin/env node
/**
 * Trace Web Push delivery setup for voice calls between two users.
 * Usage: DATABASE_URL=... [NEXTAUTH_SECRET=...] node scripts/trace-voice-push.js [callerHint] [calleeHint]
 */
const { PrismaClient } = require('@prisma/client')
const { createHmac } = require('crypto')

const prisma = new PrismaClient()

function matchUser(users, hint) {
  const h = hint.toLowerCase().replace(/\s+/g, '')
  return users.find(
    (u) =>
      u.username?.toLowerCase().replace(/\s+/g, '') === h ||
      u.name?.toLowerCase().replace(/\s+/g, '') === h ||
      u.username?.toLowerCase().includes(h) ||
      u.name?.toLowerCase().includes(h),
  )
}

function endpointKind(endpoint) {
  if (endpoint.includes('fcm.googleapis.com')) return 'FCM/Android'
  if (endpoint.includes('updates.push.services.mozilla.com')) return 'Mozilla/Firefox'
  if (endpoint.includes('web.push.apple.com')) return 'Apple/WebKit'
  return 'other'
}

function declineToken(callId) {
  const secret =
    process.env.NEXTAUTH_SECRET || process.env.VOICE_DECLINE_SECRET || process.env.APNS_KEY_ID
  if (!secret) return null
  return createHmac('sha256', secret).update(`voice-decline:${callId}`).digest('hex').slice(0, 32)
}

async function main() {
  const callerHint = process.argv[2] || 'LionKing'
  const calleeHint = process.argv[3] || 'YoungCloud'

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { username: { contains: 'Lion', mode: 'insensitive' } },
        { username: { contains: 'Young', mode: 'insensitive' } },
        { name: { contains: 'Lion', mode: 'insensitive' } },
        { name: { contains: 'Young', mode: 'insensitive' } },
      ],
    },
    select: { id: true, username: true, name: true },
  })

  console.log('=== MATCHING USERS ===')
  for (const u of users) {
    console.log(`  ${u.username} (${u.name || 'no name'}) id=${u.id}`)
  }

  const caller = matchUser(users, callerHint)
  const callee = matchUser(users, calleeHint)

  if (!caller) {
    console.error(`Caller not found for hint: ${callerHint}`)
    process.exit(1)
  }
  if (!callee) {
    console.error(`Callee not found for hint: ${calleeHint}`)
    process.exit(1)
  }

  console.log(`\nCaller: ${caller.username} (${caller.name})`)
  console.log(`Callee: ${callee.username} (${callee.name})`)

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: callee.id },
    select: {
      id: true,
      endpoint: true,
      userAgent: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: 'desc' },
  })

  console.log(`\n=== CALLEE WEB PUSH SUBSCRIPTIONS (${subs.length}) ===`)
  if (subs.length === 0) {
    console.log('  NONE — server will log [WebPush] no push subscriptions and send nothing.')
  }
  for (const s of subs) {
    console.log(
      JSON.stringify(
        {
          kind: endpointKind(s.endpoint),
          updatedAt: s.updatedAt,
          userAgent: s.userAgent,
          endpoint: s.endpoint.slice(0, 100) + '...',
        },
        null,
        2,
      ),
    )
  }

  const voip = await prisma.voipPushToken.findMany({
    where: { userId: callee.id },
    select: { platform: true, updatedAt: true },
  })
  console.log(`\n=== CALLEE VOIP TOKENS (${voip.length}) ===`)
  for (const v of voip) console.log(`  platform=${v.platform} updatedAt=${v.updatedAt}`)
  const androidVoip = voip.filter((v) => v.platform === 'android')
  const iosVoip = voip.filter((v) => v.platform === 'ios')
  if (androidVoip.length === 0) {
    console.log('  Android native: NONE — install Play internal app and sign in for lock-screen calls.')
  }
  if (iosVoip.length === 0) {
    console.log('  iOS native: NONE — install TestFlight app for lock-screen calls.')
  }

  const calls = await prisma.voiceCall.findMany({
    where: { callerId: caller.id, calleeId: callee.id },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: {
      id: true,
      status: true,
      createdAt: true,
      endedAt: true,
    },
  })

  console.log(`\n=== RECENT CALLS (${calls.length}) ===`)
  for (const c of calls) {
    console.log(`  ${c.createdAt.toISOString()}  ${c.status.padEnd(10)}  ${c.id}`)
  }

  if (calls.length > 0) {
    const latest = calls[0]
    const webSignals = await prisma.voiceCallSignal.findMany({
      where: {
        callId: latest.id,
        type: {
          in: ['web_push_ring', 'web_push_dismiss', 'web_push_device_ack', 'web_push_no_subscriptions'],
        },
      },
      orderBy: { createdAt: 'asc' },
      select: { type: true, payload: true, createdAt: true },
    })

    console.log(`\n=== WEB PUSH TRACE (latest call ${latest.id}) ===`)
    if (webSignals.length === 0) {
      console.log('  No web_push_* signals recorded (tracing added recently — place a new test call after deploy).')
    }
    for (const s of webSignals) {
      console.log(`  ${s.createdAt.toISOString()}  ${s.type}`)
      console.log(`    ${s.payload}`)
    }

    const token = declineToken(latest.id)
    if (token) {
      console.log('\n=== CALL TRACE URL (after deploy with tracing) ===')
      console.log(
        `  https://aimediatank.com/api/chat/voice/call-trace?callId=${latest.id}&token=${token}`,
      )
    }

    const signals = await prisma.voiceCallSignal.findMany({
      where: { callId: latest.id },
      orderBy: { createdAt: 'asc' },
      select: { type: true, payload: true, createdAt: true, fromUserId: true },
    })
    console.log(`\n=== SIGNALS FOR LATEST CALL ${latest.id} ===`)
    for (const s of signals) {
      const payloadPreview =
        s.payload.length > 120 ? s.payload.slice(0, 120) + '...' : s.payload
      console.log(`  ${s.createdAt.toISOString()}  ${s.type}  ${payloadPreview}`)
    }
  }

  console.log('\n=== VAPID (local env only) ===')
  console.log(
    `  configured: ${Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)}`,
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
