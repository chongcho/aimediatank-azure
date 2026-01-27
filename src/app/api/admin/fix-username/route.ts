import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Admin endpoint to fix usernames
// GET: List users with usernames ending in "0" (potential issues)
// POST: Update username for a user (with secret key)

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    
    if (search) {
      // Search for specific user
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { username: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ]
        },
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          createdAt: true,
        }
      })

      if (!user) {
        return NextResponse.json({ 
          found: false, 
          message: `No user found matching: ${search}` 
        })
      }

      return NextResponse.json({
        found: true,
        user
      })
    }

    // List users whose usernames end with "0"
    const usersEndingIn0 = await prisma.user.findMany({
      where: {
        username: {
          endsWith: '0'
        }
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    return NextResponse.json({
      count: usersEndingIn0.length,
      message: 'Users with usernames ending in "0" (potential issues)',
      users: usersEndingIn0
    })

  } catch (error) {
    console.error('Error listing users:', error)
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { currentUsername, newUsername, secretKey } = await request.json()

    // Simple secret key protection
    if (secretKey !== 'aimediatank2024fix') {
      return NextResponse.json({ error: 'Invalid secret key' }, { status: 401 })
    }

    if (!currentUsername || !newUsername) {
      return NextResponse.json({ error: 'currentUsername and newUsername required' }, { status: 400 })
    }

    // Find user by current username (case-insensitive)
    const user = await prisma.user.findFirst({
      where: {
        username: {
          equals: currentUsername,
          mode: 'insensitive'
        }
      }
    })

    if (!user) {
      return NextResponse.json({ error: `User not found: ${currentUsername}` }, { status: 404 })
    }

    // Check if new username is already taken
    const existingUser = await prisma.user.findFirst({
      where: {
        username: {
          equals: newUsername,
          mode: 'insensitive'
        }
      }
    })

    if (existingUser && existingUser.id !== user.id) {
      return NextResponse.json({ 
        error: 'Username already in use by another account',
        existingUser: existingUser.username
      }, { status: 400 })
    }

    const oldUsername = user.username

    // Update username
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { username: newUsername },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Username updated successfully',
      oldUsername,
      newUsername: updatedUser.username,
      user: updatedUser
    })

  } catch (error) {
    console.error('Error updating username:', error)
    return NextResponse.json({ error: 'Failed to update username' }, { status: 500 })
  }
}
