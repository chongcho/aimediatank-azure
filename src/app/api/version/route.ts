import { NextResponse } from 'next/server'
import { APP_BUILD_ID, APP_VERSION } from '@/lib/appVersion'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    {
      version: APP_BUILD_ID,
      buildId: APP_BUILD_ID,
      packageVersion: APP_VERSION,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
