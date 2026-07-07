import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseUserAgent } from '@/lib/parseUserAgent'
import { detectAbnormalAccess, detectBadBotUserAgent, maybeNotifyAbnormalAccess } from '@/lib/accessLogAbnormal'
import { isPrivateClientIp } from '@/lib/clientIpFromRequest'
import { lookupGeoByIp } from '@/lib/ipGeoLookup'

export const dynamic = 'force-dynamic'

const LOG_ACCESS_SECRET_HEADER = 'x-log-access-secret'

/**
 * POST /api/admin/log-access
 * Called by middleware (fire-and-forget) to record page visits.
 * Geo lookup is only performed when the request includes the trusted LOG_ACCESS_SECRET
 * header (set by our middleware) to prevent SSRF via client-supplied IP.
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
      userName,
      userEmail,
      statusCode,
      ipDebugHeaders,
    } = body as {
      ipAddress?: string
      userAgent?: string
      path?: string
      method?: string
      query?: string
      referrer?: string
      sessionId?: string
      userId?: string
      userName?: string
      userEmail?: string
      statusCode?: number
      ipDebugHeaders?: string | null
    }

    if (!path || typeof path !== 'string') {
      return NextResponse.json({ error: 'path required' }, { status: 400 })
    }

    const { browser, os, device } = parseUserAgent(userAgent)

    let city: string | null = null
    let region: string | null = null
    let country: string | null = null

    const expectedSecret = process.env.LOG_ACCESS_SECRET
    const providedSecret = request.headers.get(LOG_ACCESS_SECRET_HEADER)?.trim()
    const isTrustedCaller = Boolean(expectedSecret && providedSecret === expectedSecret)

    if (isTrustedCaller && ipAddress && !isPrivateClientIp(ipAddress)) {
      const geo = await lookupGeoByIp(ipAddress)
      city = geo.city
      region = geo.region
      country = geo.country
    }

    const pathStored = path.substring(0, 2048)
    const methodStored = method.substring(0, 16)
    const pathFlags = detectAbnormalAccess({
      path: pathStored,
      method: methodStored,
      statusCode: statusCode ?? null,
      query: query ? String(query).substring(0, 2048) : null,
      referrer: referrer ? String(referrer).substring(0, 2048) : null,
      userAgent: userAgent ?? null,
    })
    const botFlags = detectBadBotUserAgent(userAgent)
    const abnormalFlagsArr = Array.from(new Set([...pathFlags, ...botFlags])).sort()

    await prisma.siteAccessLog.create({
      data: {
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        browser: browser ?? null,
        os: os ?? null,
        device: device ?? null,
        city,
        region,
        country,
        path: pathStored,
        method: methodStored,
        query: query ? String(query).substring(0, 2048) : null,
        referrer: referrer ? String(referrer).substring(0, 2048) : null,
        sessionId: sessionId ?? null,
        userId: userId ?? null,
        userName: userName ?? null,
        userEmail: userEmail ?? null,
        statusCode: statusCode ?? null,
        abnormalFlags: abnormalFlagsArr.length ? JSON.stringify(abnormalFlagsArr) : null,
        ipDebugHeaders:
          typeof ipDebugHeaders === 'string' && ipDebugHeaders.trim()
            ? ipDebugHeaders.trim().slice(0, 4096)
            : null,
      },
    })

    if (abnormalFlagsArr.length > 0) {
      void maybeNotifyAbnormalAccess({
        flags: abnormalFlagsArr,
        path: pathStored,
        method: methodStored,
        ipAddress: ipAddress ?? null,
        country,
        city,
      }).catch((err) => console.error('[log-access] abnormal notify', err))
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[log-access]', e)
    return NextResponse.json({ error: 'Failed to log' }, { status: 500 })
  }
}
