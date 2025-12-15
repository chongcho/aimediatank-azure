import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const dynamic = 'force-dynamic'

// GET - Fetch current user's profile
export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        legalName: true,
        avatar: true,
        bio: true,
        phone: true,
        location: true,
        ageRange: true,
        role: true,
        membershipType: true,
        emailVerified: true,
        createdAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error fetching profile:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

// PUT - Update current user's profile
export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name, legalName, username, email, phone, location, ageRange, bio, password, avatar } = body

    // Check if username is taken by another user
    if (username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username,
          NOT: { id: session.user.id },
        },
      })

      if (existingUser) {
        return NextResponse.json(
          { error: 'Username is already taken' },
          { status: 400 }
        )
      }
    }

    // Check if email is taken by another user
    if (email) {
      const existingUser = await prisma.user.findFirst({
        where: {
          email,
          NOT: { id: session.user.id },
        },
      })

      if (existingUser) {
        return NextResponse.json(
          { error: 'Email is already taken' },
          { status: 400 }
        )
      }
    }

    // Build update data
    const updateData: any = {}

    if (name !== undefined) updateData.name = name
    if (legalName !== undefined) updateData.legalName = legalName
    if (username !== undefined) updateData.username = username
    if (email !== undefined) {
      // If email changed, reset verification
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { email: true },
      })
      if (currentUser && currentUser.email !== email) {
        updateData.email = email
        updateData.emailVerified = false
      }
    }
    if (phone !== undefined) updateData.phone = phone
    if (location !== undefined) updateData.location = location
    if (ageRange !== undefined) updateData.ageRange = ageRange
    if (bio !== undefined) updateData.bio = bio
    if (avatar !== undefined) updateData.avatar = avatar

    // Hash password if provided
    if (password && password.length >= 6) {
      updateData.password = await bcrypt.hash(password, 10)
    }

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        legalName: true,
        avatar: true,
        bio: true,
        phone: true,
        location: true,
        ageRange: true,
        role: true,
        membershipType: true,
        emailVerified: true,
      },
    })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('Error updating profile:', error)
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}




