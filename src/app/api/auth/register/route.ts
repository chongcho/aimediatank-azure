import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'

// Function to generate verification token
function generateVerificationToken() {
  return uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
}

export async function POST(request: Request) {
  try {
    const { email, username, password, name, ageRange, role } = await request.json()

    // Validation
    if (!email || !username || !password) {
      return NextResponse.json(
        { error: 'Email, username, and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // Check if email exists
    const existingEmail = await prisma.user.findUnique({
      where: { email },
    })

    if (existingEmail) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      )
    }

    // Check if username exists
    const existingUsername = await prisma.user.findUnique({
      where: { username },
    })

    if (existingUsername) {
      return NextResponse.json(
        { error: 'Username already taken' },
        { status: 400 }
      )
    }

    // Hash password
    const hashedPassword = await hash(password, 12)
    
    // All new users are SUBSCRIBER by default (can upload media)
    const userRole = 'SUBSCRIBER'

    // Generate verification token
    const verificationToken = generateVerificationToken()
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Create user
    // Note: New fields (ageRange, emailVerified, etc.) require running: 
    // npx prisma db push && npx prisma generate
    const user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        name: name || username,
        role: userRole,
      } as any,
    })

    // Log verification email in development
    const verificationUrl = `${process.env.NEXTAUTH_URL}/verify-email?token=${verificationToken}`
    
    console.log('='.repeat(60))
    console.log('NEW USER VERIFICATION EMAIL')
    console.log('='.repeat(60))
    console.log(`To: ${user.email}`)
    console.log(`Subject: Welcome to AI Media Tank - Verify your email`)
    console.log(``)
    console.log(`Hello ${user.name || user.username},`)
    console.log(``)
    console.log(`Welcome to AI Media Tank! Please click the link below to verify your email:`)
    console.log(verificationUrl)
    console.log(``)
    console.log(`This link will expire in 24 hours.`)
    console.log('='.repeat(60))

    return NextResponse.json({
      message: 'User created successfully!',
      userId: user.id,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    })
  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
