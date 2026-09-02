import { NextResponse } from 'next/server'
import { tryAutoBlockProbeIp } from '@/lib/autoBlockProbeIp'
import { BLOCKED_IP_LIST_HEADER } from '@/lib/blockedIpListClient'

export const dynamic = 'force-dynamic'

/**
 * Called from middleware when a probe path or bad-bot UA is denied.
 * Adds client IP to BlockedIp (note: Auto (probe) / Auto (bad-bot)).
 * Secured with the same header secret as other internal blocklist routes.
 */
export async function POST(request: Request) {
  const secret = process.env.BLOCKED_IP_LIST_SECRET?.trim()
  if (!secret || request.headers.get(BLOCKED_IP_LIST_HEADER)?.trim() !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const rawIp = typeof body.ipAddress === 'string' ? body.ipAddress : ''
  const path = typeof body.path === 'string' ? body.path : ''
  const flags = Array.isArray(body.flags) ? body.flags.filter((x: unknown) => typeof x === 'string') : []
  const category = body.category === 'bad_bot' ? 'bad_bot' : 'probe'
  const uaRaw = typeof body.userAgent === 'string' ? body.userAgent : ''

  try {
    const result = await tryAutoBlockProbeIp({
      ipAddress: rawIp,
      path,
      flags,
      category,
      userAgent: uaRaw || null,
    })
    return NextResponse.json(result)
  } catch (e) {
    console.error('[auto-block-probe]', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
