import { NextResponse } from 'next/server'
import { getVapidPublicKey } from '@/lib/webPush'

export const dynamic = 'force-dynamic'

export async function GET() {
  const publicKey = getVapidPublicKey()
  if (!publicKey) {
    return NextResponse.json({ publicKey: null })
  }
  return NextResponse.json({ publicKey })
}
