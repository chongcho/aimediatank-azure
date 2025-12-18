import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  try {
    const { username, currentUserId } = await req.json()

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      )
    }

    // Validate username format (alphanumeric, underscores, hyphens, 3-30 chars)
    const usernameRegex = /^[a-zA-Z0-9_-]{3,30}$/
    if (!usernameRegex.test(username)) {
      return NextResponse.json({
        valid: false,
        available: false,
        message: 'Username must be 3-30 characters and contain only letters, numbers, underscores, or hyphens',
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
        message: 'This User ID is already taken',
      })
    }

    return NextResponse.json({
      valid: true,
      available: true,
      message: 'User ID is available',
    })
  } catch (error) {
    console.error('Username check error:', error)
    return NextResponse.json(
      { error: 'Failed to check username' },
      { status: 500 }
    )
  }
}




