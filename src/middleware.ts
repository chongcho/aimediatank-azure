import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isClientIpBlocked } from '@/lib/blockedIpListClient'

const LOG_ACCESS_PATH = '/api/admin/log-access'
const SESSION_COOKIE = '_sa_sid'

const SKIP_PATHS = new Set([
  LOG_ACCESS_PATH,
  '/robots933456.txt',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
])

/** Paths that must stay reachable even when IP is on the blocklist (auth, webhooks, cron, internal list). */
function isIpBlockExemptPath(pathname: string): boolean {
  if (pathname.startsWith('/api/internal/blocked-ip-list')) return true
  if (pathname.startsWith('/api/auth')) return true
  if (pathname.startsWith('/api/stripe/webhook')) return true
  if (pathname.startsWith('/api/cron/')) return true
  if (pathname === '/api/health') return true
  return false
}

function stripPort(ip: string): string {
  if (ip.startsWith('[')) return ip.replace(/^\[([^\]]+)\].*$/, '$1')
  const parts = ip.split(':')
  if (parts.length === 2 && /^\d+$/.test(parts[1])) return parts[0]
  return ip
}

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  const raw = forwarded ? forwarded.split(',')[0]?.trim() ?? null : request.headers.get('x-real-ip') ?? null
  return raw ? stripPort(raw) : null
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const clientIp = getClientIp(request)

  if (!isIpBlockExemptPath(pathname) && clientIp) {
    const blocked = await isClientIpBlocked(clientIp, request.nextUrl.origin)
    if (blocked) {
      return new NextResponse('Forbidden', {
        status: 403,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }
  }

  if (SKIP_PATHS.has(pathname) || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const ip = clientIp
  const userAgent = request.headers.get('user-agent') ?? undefined
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
