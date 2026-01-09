import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// One-time use endpoint to set admin - protect with a secret key
// DELETE THIS FILE AFTER USE
export async function POST(request: Request) {
  try {
    const { email, secret } = await request.json()

    // Simple secret protection - change this to something unique
    if (secret !== 'AIMEDIATANK_ADMIN_SETUP_2026') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!email) {
      return NextResponse.json({ error: 'Email required' }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { role: 'ADMIN' },
      select: { id: true, username: true, email: true, role: true }
    })

    return NextResponse.json({ 
      success: true, 
      message: `User ${user.username} (${user.email}) is now an ADMIN`,
      user 
    })
  } catch (error: any) {
    console.error('Error setting admin:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to set admin' },
      { status: 500 }
    )
  }
}

