import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const LOG_ACCESS_PATH = '/api/admin/log-access'
const SESSION_COOKIE = '_sa_sid'

function getClientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return request.headers.get('x-real-ip') ?? null
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (pathname === LOG_ACCESS_PATH) return NextResponse.next()

  const ip = getClientIp(request)
  const userAgent = request.headers.get('user-agent') ?? undefined
  const referrer = request.headers.get('referer') ?? request.headers.get('referer') ?? undefined
  const method = request.method
  const query = request.nextUrl.search ? request.nextUrl.search.slice(1) : undefined

  let sessionId = request.cookies.get(SESSION_COOKIE)?.value
  if (!sessionId && typeof crypto !== 'undefined' && crypto.randomUUID) {
    sessionId = crypto.randomUUID()
  }

  const origin = request.nextUrl.origin
  const payload = {
    ipAddress: ip ?? undefined,
    userAgent,
    path: pathname,
    method,
    query,
    referrer,
    sessionId: sessionId ?? undefined,
    city: request.headers.get('x-vercel-ip-city') ?? request.headers.get('x-azure-ip-city') ?? undefined,
    region: request.headers.get('x-vercel-ip-country-region') ?? request.headers.get('x-azure-ip-region') ?? undefined,
    country: request.headers.get('x-vercel-ip-country') ?? request.headers.get('x-azure-ip-country') ?? undefined,
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

  try {
    await Promise.race([
      fetch(`${origin}${LOG_ACCESS_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ])
  } catch (_) {
    // Non-blocking: do not fail the request if logging fails
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg|woff2?)$).*)'],
}
