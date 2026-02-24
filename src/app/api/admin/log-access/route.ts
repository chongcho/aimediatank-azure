import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseUserAgent } from '@/lib/parseUserAgent'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/log-access
 * Called by middleware (or server) to record a site access for analytics, support, security.
 * No auth required; only same-origin requests should hit this (middleware).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const {
      ipAddress,
      userAgent,
      path,
      method = 'GET',
      query,
      referrer,
      sessionId,
      userId,
      city,
      region,
      country,
      statusCode,
    } = body as {
      ipAddress?: string
      userAgent?: string
      path?: string
      method?: string
      query?: string
      referrer?: string
      sessionId?: string
      userId?: string
      city?: string
      region?: string
      country?: string
      statusCode?: number
    }

    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'path required' }, { status: 400 })
    }

    const { browser, os, device } = parseUserAgent(userAgent)

    await prisma.siteAccessLog.create({
      data: {
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        browser: browser ?? null,
        os: os ?? null,
        device: device ?? null,
        city: city ?? null,
        region: region ?? null,
        country: country ?? null,
        path: path.substring(0, 2048),
        method: method.substring(0, 16),
        query: query ? String(query).substring(0, 2048) : null,
        referrer: referrer ? String(referrer).substring(0, 2048) : null,
        sessionId: sessionId ?? null,
        userId: userId ?? null,
        statusCode: statusCode ?? null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[log-access]', e)
    return NextResponse.json({ error: 'Failed to log' }, { status: 500 })
  }
}
