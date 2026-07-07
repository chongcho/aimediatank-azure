import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { ADMIN_FRESH_STEP2_PARAM } from '@/lib/adminFreshStep2'
import { buildExpiredAdminReauthCookie } from '@/lib/adminReauthConstants'
import { BLOCKED_IP_LIST_HEADER, isClientIpBlocked } from '@/lib/blockedIpListClient'
import {
  getClientIpFromHeaders,
  isLikelyAzurePlatformPing,
  isPrivateClientIp,
  stripClientIpPort,
} from '@/lib/clientIpFromRequest'
import { detectAbnormalAccess } from '@/lib/accessLogAbnormalDetect'
import { detectBadBotUserAgent } from '@/lib/badBotDetect'
import { isAppAdminRole } from '@/lib/adminFreshStep2'
import { parseGamePath, isGameRouteAllowed } from '@/lib/gameRouteAccess'
import { fetchGameRouteAccess } from '@/lib/gameRouteAccessClient'
import {
  collectIpDebugHeaders,
  serializeIpDebugHeaders,
  shouldCaptureIpDebugHeaders,
} from '@/lib/ipDebugHeaders'

const LOG_ACCESS_PATH = '/api/admin/log-access'
const SESSION_COOKIE = '_sa_sid'

const SKIP_PATHS = new Set([
  LOG_ACCESS_PATH,
  '/robots933456.txt',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
])

/** Paths reachable despite blocklist / skipped for abnormal-path denial (auth, webhooks, cron, internal APIs). */
function isSecurityExemptPath(pathname: string): boolean {
  if (pathname.startsWith('/api/internal/blocked-ip-list')) return true
  if (pathname.startsWith('/api/internal/auto-block-probe')) return true
  if (pathname.startsWith('/api/auth')) return true
  if (pathname.startsWith('/api/stripe/webhook')) return true
  if (pathname.startsWith('/api/cron/')) return true
  if (pathname === '/api/health') return true
  return false
}

function enqueueAutoBlockSecurity(params: {
  clientIp: string | null
  pathname: string
  flags: string[]
  origin: string
  category: 'probe' | 'bad_bot'
  userAgent?: string | null
}) {
  const secret = process.env.BLOCKED_IP_LIST_SECRET?.trim()
  if (!secret || !params.clientIp) return
  const ip = stripClientIpPort(params.clientIp)
  if (isPrivateClientIp(ip)) return
  fetch(`${params.origin}/api/internal/auto-block-probe`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      [BLOCKED_IP_LIST_HEADER]: secret,
    },
    body: JSON.stringify({
      ipAddress: ip,
      path: params.pathname,
      flags: params.flags,
      category: params.category,
      ...(params.category === 'bad_bot' && params.userAgent
        ? { userAgent: params.userAgent.slice(0, 1024) }
        : {}),
    }),
  }).catch(() => {})
}

function getClientIp(request: NextRequest): string | null {
  return getClientIpFromHeaders(request.headers)
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const clientIp = getClientIp(request)

  // AdSense (and other crawlers) must fetch /ads.txt without IP block or bot heuristics.
  // Otherwise a 403 or failed check can flip "Ads.txt status" to Not found after a later recrawl.
  if (pathname === '/ads.txt') {
    return NextResponse.next()
  }

  if (!isSecurityExemptPath(pathname) && clientIp) {
    const blocked = await isClientIpBlocked(clientIp, request.nextUrl.origin)
    if (blocked) {
      return new NextResponse('Forbidden', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
  }

  if (!isSecurityExemptPath(pathname) && !SKIP_PATHS.has(pathname)) {
    const abnormalFlags = detectAbnormalAccess({ path: pathname, method: request.method })
    if (abnormalFlags.length > 0) {
      enqueueAutoBlockSecurity({
        clientIp,
        pathname,
        flags: abnormalFlags,
        origin: request.nextUrl.origin,
        category: 'probe',
      })
      return new NextResponse('Forbidden', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    const botFlags = detectBadBotUserAgent(request.headers.get('user-agent'))
    if (botFlags.length > 0) {
      enqueueAutoBlockSecurity({
        clientIp,
        pathname,
        flags: botFlags,
        origin: request.nextUrl.origin,
        category: 'bad_bot',
        userAgent: request.headers.get('user-agent'),
      })
      return new NextResponse('Forbidden', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
  }

  // Force Admin Step 2: clear admin_reauth on this response (same navigation as the page).
  // Redirect was unreliable with App Router soft navigation (verify-access could run before Set-Cookie applied).
  if (pathname === '/admin' && request.nextUrl.searchParams.get(ADMIN_FRESH_STEP2_PARAM) === '1') {
    const res = NextResponse.next()
    const c = buildExpiredAdminReauthCookie()
    res.cookies.set(c.name, c.value, c.options)
    return res
  }

  if (SKIP_PATHS.has(pathname) || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const userAgent = request.headers.get('user-agent') ?? undefined
  if (
    isLikelyAzurePlatformPing({
      headers: request.headers,
      clientIp,
      pathname,
      userAgent,
    })
  ) {
    return NextResponse.next()
  }

  const gamePath = parseGamePath(pathname)
  if (gamePath.kind !== 'none') {
    let isAdmin = false
    try {
      const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
      isAdmin = isAppAdminRole(typeof token?.role === 'string' ? token.role : undefined)
    } catch {
      /* ignore */
    }
    const gameAccess = await fetchGameRouteAccess(request.nextUrl.origin)
    if (!isGameRouteAllowed(gamePath, gameAccess, { isAdmin })) {
      return new NextResponse('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
  }

  const ip = clientIp
  const referrer = request.headers.get('referer') ?? undefined
  const method = request.method
  const query = request.nextUrl.search ? request.nextUrl.search.slice(1) : undefined

  let sessionId = request.cookies.get(SESSION_COOKIE)?.value
  if (!sessionId && typeof crypto !== 'undefined' && crypto.randomUUID) {
    sessionId = crypto.randomUUID()
  }

  let userId: string | undefined
  let userName: string | undefined
  let userEmail: string | undefined
  try {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
    if (token) {
      userId = (token.id as string) || undefined
      userName = (token.name as string) || undefined
      userEmail = (token.email as string) || undefined
    }
  } catch {}

  const payload = {
    ipAddress: ip ?? undefined,
    userAgent,
    path: pathname,
    method,
    query,
    referrer,
    sessionId: sessionId ?? undefined,
    userId,
    userName,
    userEmail,
    ...(shouldCaptureIpDebugHeaders(clientIp)
      ? { ipDebugHeaders: serializeIpDebugHeaders(collectIpDebugHeaders(request.headers)) }
      : {}),
  }

  const response = NextResponse.next()

  if (sessionId) {
    response.cookies.set(SESSION_COOKIE, sessionId, {
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
      sameSite: 'lax',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
    })
  }

  const logUrl =
    (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin) +
    LOG_ACCESS_PATH

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const logAccessSecret = process.env.LOG_ACCESS_SECRET
  if (logAccessSecret) {
    headers['x-log-access-secret'] = logAccessSecret
  }

  fetch(logUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  }).catch(() => {})

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg|woff2?)$).*)'],
}
