import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { localeTagFromUserLocation } from '@/lib/localeFromLocation'
import { prisma } from '@/lib/prisma'
import { verifyPhoneCode, normalizePhone } from '@/lib/phoneVerificationCodes'
import { parseBirthdayToIso, parseBirthdayToDate } from '@/lib/birthday'
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
        birthday: true,
        role: true,
        membershipType: true,
        emailVerified: true,
        createdAt: true,
        accountDeactivatedAt: true,
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    /** UI / translate tag from saved `User.location`; empty → `en` (treated like United States). */
    const localeFromProfileLocation = localeTagFromUserLocation(user.location)

    return NextResponse.json({ user, localeFromProfileLocation })
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

    const self = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { accountDeactivatedAt: true },
    })
    if (self?.accountDeactivatedAt) {
      return NextResponse.json(
        { error: 'Account is deactivated. Profile cannot be edited.' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const { name, legalName, username, email, phone, location, bio, birthday, password, avatar, phoneVerificationCode } = body

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
    if (phone !== undefined) {
      const currentUser = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { phone: true },
      })
      const currentPhoneNorm = currentUser?.phone ? normalizePhone(currentUser.phone) : ''
      const newPhoneNorm = phone && typeof phone === 'string' ? normalizePhone(phone) : ''
      const phoneAddedOrChanged = newPhoneNorm.length >= 10 && newPhoneNorm !== currentPhoneNorm
      if (phoneAddedOrChanged) {
        if (!phoneVerificationCode || typeof phoneVerificationCode !== 'string' || phoneVerificationCode.trim().length !== 6) {
          return NextResponse.json(
            { error: 'Please verify your phone number: request a code and enter the 6-digit code before saving.' },
            { status: 400 }
          )
        }
        const result = await verifyPhoneCode(phone, phoneVerificationCode.trim())
        if (!result.valid) {
          return NextResponse.json(
            { error: result.error || 'Invalid or expired verification code. Please request a new code.' },
            { status: 400 }
          )
        }
      }
      updateData.phone = phone || null
    }
    if (location !== undefined) updateData.location = location
    if (bio !== undefined) updateData.bio = bio
    if (birthday !== undefined) {
      if (!birthday) {
        updateData.birthday = null
      } else {
        const birthdayIso = parseBirthdayToIso(String(birthday))
        if (!birthdayIso) {
          return NextResponse.json(
            { error: 'Please enter a valid birthday' },
            { status: 400 }
          )
        }
        updateData.birthday = parseBirthdayToDate(birthdayIso)
      }
    }
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
        birthday: true,
        role: true,
        membershipType: true,
        emailVerified: true,
      },
    })

    return NextResponse.json({
      user,
      localeFromProfileLocation: localeTagFromUserLocation(user.location),
    })
  } catch (error) {
    console.error('Error updating profile:', error)
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}




