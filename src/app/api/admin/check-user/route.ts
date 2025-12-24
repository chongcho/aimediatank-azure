import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Check user details - admin only
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    // Only allow admin users
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const email = searchParams.get('email')
    const username = searchParams.get('username')

    if (!email && !username) {
      return NextResponse.json({ error: 'Email or username required' }, { status: 400 })
    }

    // Find user by email or username
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          email ? { email: email.toLowerCase() } : {},
          username ? { username: username } : {},
        ].filter(obj => Object.keys(obj).length > 0)
      },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        legalName: true,
        role: true,
        emailVerified: true,
        createdAt: true,
      }
    })

    if (!user) {
      // Also try case-insensitive username search
      const userByUsername = username ? await prisma.user.findFirst({
        where: {
          username: {
            equals: username,
            mode: 'insensitive'
          }
        },
        select: {
          id: true,
          email: true,
          username: true,
          name: true,
          legalName: true,
          role: true,
          emailVerified: true,
          createdAt: true,
        }
      }) : null

      if (userByUsername) {
        return NextResponse.json({ user: userByUsername })
      }

      return NextResponse.json({ 
        error: 'User not found',
        searchedEmail: email,
        searchedUsername: username 
      }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error checking user:', error)
    return NextResponse.json({ error: 'Failed to check user' }, { status: 500 })
  }
}

// Update user email - admin only
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { username, newEmail } = await request.json()

    if (!username || !newEmail) {
      return NextResponse.json({ error: 'Username and newEmail required' }, { status: 400 })
    }

    // Find user
    const user = await prisma.user.findFirst({
      where: {
        username: {
          equals: username,
          mode: 'insensitive'
        }
      }
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Check if new email is already taken
    const existingUser = await prisma.user.findUnique({
      where: { email: newEmail.toLowerCase() }
    })

    if (existingUser && existingUser.id !== user.id) {
      return NextResponse.json({ error: 'Email already in use by another account' }, { status: 400 })
    }

    // Update email
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { email: newEmail.toLowerCase() },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
      }
    })

    return NextResponse.json({ 
      success: true, 
      message: 'Email updated successfully',
      user: updatedUser 
    })
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

