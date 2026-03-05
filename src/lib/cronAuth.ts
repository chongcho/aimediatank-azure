import { NextResponse } from 'next/server'

/**
 * Validates cron job requests. Use for all /api/cron/* routes.
 * - Accepts Authorization: Bearer <CRON_SECRET> or x-cron-secret: <CRON_SECRET>
 * - In production, CRON_SECRET must be set; if missing, returns 503.
 * - If secret is set but header is wrong/missing, returns 401.
 */
export function requireCronAuth(request: Request): NextResponse | null {
  const cronSecret = process.env.CRON_SECRET
  const isProduction = process.env.NODE_ENV === 'production'

  if (isProduction && !cronSecret) {
    return NextResponse.json(
      { error: 'Cron not configured (CRON_SECRET missing)' },
      { status: 503 }
    )
  }

  const authHeader =
    request.headers.get('authorization')?.trim() ||
    request.headers.get('x-cron-secret')?.trim() ||
    ''
  const validBearer = cronSecret && authHeader === `Bearer ${cronSecret}`
  const validPlain = cronSecret && authHeader === cronSecret

  if (cronSecret && !validBearer && !validPlain) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
