import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createNativeAuthHandoffCode, normalizeHandoffPlatform } from '@/lib/nativeAuthHandoff'

export const dynamic = 'force-dynamic'

/**
 * Called from the system browser once social sign-in has completed there, so the native app
 * WebView can exchange the returned code for its own session.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}) as Record<string, unknown>)
  const platform = normalizeHandoffPlatform((body as { platform?: unknown }).platform)

  try {
    const code = await createNativeAuthHandoffCode(session.user.id, platform)
    return NextResponse.json({ code })
  } catch (error) {
    console.error('[native-handoff] failed to mint code:', error)
    return NextResponse.json({ error: 'Could not start native sign-in handoff' }, { status: 500 })
  }
}
