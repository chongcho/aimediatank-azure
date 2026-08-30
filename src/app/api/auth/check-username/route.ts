import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  USERNAME_AVAILABLE_MESSAGE,
  USERNAME_TAKEN_MESSAGE,
  validateUsernameFormat,
} from '@/lib/usernameValidation'

export async function POST(req: NextRequest) {
  try {
    const { username, currentUserId } = await req.json()

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      )
    }

    const format = validateUsernameFormat(username)
    if (!format.valid) {
      return NextResponse.json({
        valid: false,
        available: false,
        message: format.message,
      })
    }

    // Check if username is already taken
    const existingUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    })

    // If currentUserId is provided, allow the same username for that user (for profile edit)
    if (existingUser && currentUserId && existingUser.id === currentUserId) {
      return NextResponse.json({
        valid: true,
        available: true,
        message: 'This is your current username',
      })
    }

    if (existingUser) {
      return NextResponse.json({
        valid: true,
        available: false,
        message: USERNAME_TAKEN_MESSAGE,
      })
    }

    return NextResponse.json({
      valid: true,
      available: true,
      message: USERNAME_AVAILABLE_MESSAGE,
    })
  } catch (error) {
    console.error('Username check error:', error)
    return NextResponse.json(
      { error: 'Failed to check username' },
      { status: 500 }
    )
  }
}





