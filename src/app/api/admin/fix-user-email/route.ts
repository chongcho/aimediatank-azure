import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Temporary endpoint to check and fix user email
// GET: Check user by username or email
// POST: Update email for a username (with secret key)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const username = searchParams.get('username')
    const email = searchParams.get('email')

    if (username) {
      // Find user by username (case-insensitive)
      const user = await prisma.user.findFirst({
        where: {
          username: {
            equals: username,
            mode: 'insensitive'
          }
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
          message: `No user found with username: ${username}` 
        })
      }

      // Mask email for privacy (show first 3 chars and domain)
      const maskedEmail = user.email.replace(/^(.{3})(.*)(@.*)$/, '$1***$3')

      return NextResponse.json({
        found: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email, // Show full email for debugging
          maskedEmail,
          name: user.name,
          createdAt: user.createdAt,
        }
      })
    }

    if (email) {
      // Find user by email
      const user = await prisma.user.findUnique({
        where: { email: email.toLowerCase() },
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
          message: `No user found with email: ${email}` 
        })
      }

      return NextResponse.json({
        found: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          name: user.name,
          createdAt: user.createdAt,
        }
      })
    }

    return NextResponse.json({ 
      error: 'Provide ?username=xxx or ?email=xxx' 
    }, { status: 400 })

  } catch (error) {
    console.error('Error checking user:', error)
    return NextResponse.json({ error: 'Failed to check user' }, { status: 500 })
  }
}

// POST: Update user email
export async function POST(request: Request) {
  try {
    const { username, newEmail, secretKey } = await request.json()

    // Simple secret key protection (you can change this)
    if (secretKey !== 'aimediatank2024fix') {
      return NextResponse.json({ error: 'Invalid secret key' }, { status: 401 })
    }

    if (!username || !newEmail) {
      return NextResponse.json({ error: 'Username and newEmail required' }, { status: 400 })
    }

    // Find user by username (case-insensitive)
    const user = await prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: 'insensitive'
        }
      }
    })

    if (!user) {
      return NextResponse.json({ error: `User not found: ${username}` }, { status: 404 })
    }

    // Check if new email is already taken
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail.toLowerCase() }
    })

    if (existingUser && existingUser.id !== user.id) {
      return NextResponse.json({ 
        error: 'Email already in use by another account',
        existingUsername: existingUser.username
      }, { status: 400 })
    }

    const oldEmail = user.email

    // Update email
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { email: newEmail.toLowerCase() },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
      }
    })

    return NextResponse.json({
      success: true,
      message: 'Email updated successfully',
      oldEmail,
      newEmail: updatedUser.email,
      user: updatedUser
    })

  } catch (error) {
    console.error('Error updating user email:', error)
    return NextResponse.json({ error: 'Failed to update email' }, { status: 500 })
  }
}

