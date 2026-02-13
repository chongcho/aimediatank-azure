import { NextResponse } from 'next/server'

// Lightweight health check endpoint for Azure App Service health probes.
// Returns 200 immediately without touching the database so Azure can verify
// the container is alive without triggering an expensive cold-start render.
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    { status: 'ok', timestamp: new Date().toISOString() },
    { status: 200 }
  )
}
