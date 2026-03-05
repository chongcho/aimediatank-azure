import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * One-time use endpoint to promote a user to ADMIN.
 * Set ADMIN_SETUP_SECRET in env to enable. DELETE THIS FILE after initial admin is set.
 */
export async function POST(request: Request) {
  try {
    const expectedSecret = process.env.ADMIN_SETUP_SECRET
    if (!expectedSecret) {
      return NextResponse.json(
        { error: 'Admin setup is disabled (ADMIN_SETUP_SECRET not set)' },
        { status: 503 }
      )
    }

    const { email, secret } = await request.json()

    if (secret !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { email: email.toLowerCase().trim() },
      data: { role: 'ADMIN' },
      select: { id: true, username: true, email: true, role: true },
    })

    return NextResponse.json({
      success: true,
      message: `User ${user.username} (${user.email}) is now an ADMIN`,
      user,
    })
  } catch (error: unknown) {
    console.error('Error setting admin:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to set admin',
      },
      { status: 500 }
    )
  }
}
