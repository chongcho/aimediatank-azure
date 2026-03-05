import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Test endpoint to check environment variables — disabled in production for security
export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  }

  const envKeys = Object.keys(process.env).filter(
    (key) =>
      key.startsWith('SMTP') ||
      key.startsWith('DATABASE') ||
      key.startsWith('NEXTAUTH') ||
      key.startsWith('STRIPE')
  )

  return NextResponse.json({
    message: 'Environment variable check',
    smtpHost: process.env.SMTP_HOST ? 'SET' : 'NOT SET',
    smtpPort: process.env.SMTP_PORT ? 'SET' : 'NOT SET',
    smtpUser: process.env.SMTP_USER ? 'SET' : 'NOT SET',
    smtpPass: process.env.SMTP_PASS ? 'SET' : 'NOT SET',
    envKeysFound: envKeys,
    totalEnvVars: Object.keys(process.env).length,
  })
}
