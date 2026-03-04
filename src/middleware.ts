import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const LOG_ACCESS_PATH = '/api/admin/log-access'
const SESSION_COOKIE = '_sa_sid'

const SKIP_PATHS = new Set([
  LOG_ACCESS_PATH,
  '/robots933456.txt',
  '/favicon.ico',
  '/manifest.json',
  '/sw.js',
])

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return request.headers.get('x-real-ip') ?? null
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (SKIP_PATHS.has(pathname) || pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent') ?? undefined
  const referrer = request.headers.get('referer') ?? undefined
  const method = request.method
  const query = request.nextUrl.search ? request.nextUrl.search.slice(1) : undefined

  let sessionId = request.cookies.get(SESSION_COOKIE)?.value
  if (!sessionId && typeof crypto !== 'undefined' && crypto.randomUUID) {
    sessionId = crypto.randomUUID()
  }

  const payload = {
    ipAddress: ip ?? undefined,
    userAgent,
    path: pathname,
    method,
    query,
    referrer,
    sessionId: sessionId ?? undefined,
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

  fetch(logUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => {})

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg|woff2?)$).*)'],
}
