import { NextResponse } from 'next/server'
import { buildExpiredAdminReauthCookie } from '@/lib/adminReauthConstants'

export const dynamic = 'force-dynamic'

/** Clears admin panel re-auth cookie (e.g. after sign-out or before forcing Step 2). */
export async function POST() {
  const c = buildExpiredAdminReauthCookie()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(c.name, c.value, c.options)
  return res
}
