import { NextResponse } from 'next/server'
import { APP_BUILD_ID, APP_VERSION } from '@/lib/appVersion'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { version: APP_VERSION, buildId: APP_BUILD_ID },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
