#!/usr/bin/env node
/** Send one test Web Push to a user by username. */
const { PrismaClient } = require('@prisma/client')
const webpush = require('web-push')

const prisma = new PrismaClient()

async function main() {
  const username = process.argv[2] || 'YoungCloud'
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error('VAPID keys required in env')
    process.exit(1)
  }

  const user = await prisma.user.findFirst({
    where: { username: { equals: username, mode: 'insensitive' } },
    select: { id: true, username: true },
  })
  if (!user) {
    console.error('User not found:', username)
    process.exit(1)
  }

  const subs = await prisma.pushSubscription.findMany({ where: { userId: user.id } })
  console.log(`User ${user.username}: ${subs.length} subscription(s)`)
  if (subs.length === 0) process.exit(1)

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:support@aimediatank.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  )

  for (const sub of subs) {
    const payload = JSON.stringify({
      type: 'voice_call',
      callId: 'delivery-test-' + Date.now(),
      title: 'AiMediaTank push test',
      body: 'If you see this, Web Push delivery works.',
      url: '/?openChat=1',
    })
    try {
      const res = await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 45, urgency: 'high' },
      )
      console.log('OK', sub.endpoint.slice(0, 60) + '...', 'status', res.statusCode)
    } catch (e) {
      console.log('FAIL', sub.endpoint.slice(0, 60) + '...', 'status', e.statusCode, e.body || e.message)
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
