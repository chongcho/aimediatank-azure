import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Check if email is available and valid
export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { valid: false, error: 'Email is required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({
        valid: false,
        available: false,
        error: 'Invalid email format',
      })
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true },
    })

    if (existingUser) {
      return NextResponse.json({
        valid: true,
        available: false,
        error: 'This email is already registered',
      })
    }

    return NextResponse.json({
      valid: true,
      available: true,
      message: 'Email is available',
    })
  } catch (error) {
    console.error('Error checking email:', error)
    return NextResponse.json(
      { valid: false, error: 'Failed to check email' },
      { status: 500 }
    )
  }
}




