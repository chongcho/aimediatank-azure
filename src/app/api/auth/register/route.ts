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
    const { email: rawEmail, username, password, name, legalName, phone, location, ageRange, bio } = await request.json()

    // Validation
    if (!rawEmail || !username || !password) {
      return NextResponse.json(
        { error: 'Email, username, and password are required' },
        { status: 400 }
      )
    }

    // Normalize email to lowercase for consistency
    const email = rawEmail.toLowerCase()

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

    // Create user - start with core fields, then try to add optional fields
    // This handles cases where DB schema may not have all fields yet
    let user
    
    // First try with all fields
    try {
      user = await prisma.user.create({
        data: {
          email,
          username,
          password: hashedPassword,
          name: name || username,
          legalName: legalName || null,
          phone: phone || null,
          location: location || null,
          ageRange: ageRange || null,
          bio: bio || null,
          role: userRole,
          policyAgreedAt: new Date(),
        },
      })
    } catch (fieldError: any) {
      console.log('Full create failed, trying with core fields only:', fieldError?.message)
      
      // Fallback: create with only core fields that definitely exist
      user = await prisma.user.create({
      data: {
        email,
        username,
        password: hashedPassword,
        name: name || username,
        role: userRole,
        },
      })
      
      // Try to update with additional fields (ignore errors)
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            legalName: legalName || null,
            phone: phone || null,
            location: location || null,
            ageRange: ageRange || null,
            bio: bio || null,
          },
    })
      } catch (updateError) {
        console.log('Could not add optional fields:', updateError)
      }
    }

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
  } catch (error: any) {
    console.error('Registration error:', error)
    
    // Handle specific Prisma errors
    if (error?.code === 'P2002') {
      // Unique constraint violation
      const field = error?.meta?.target?.[0] || 'field'
      return NextResponse.json(
        { error: `This ${field} is already registered` },
        { status: 400 }
      )
    }
    
    if (error?.code === 'P2000') {
      // Value too long for column
      return NextResponse.json(
        { error: 'One of the values is too long' },
        { status: 400 }
      )
    }

    // Check for unknown field/column errors
    if (error?.message?.includes('Unknown argument') || error?.message?.includes('Unknown field')) {
      console.error('Schema mismatch - database may need migration:', error.message)
      return NextResponse.json(
        { error: 'Server configuration error. Please contact support.' },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { error: 'Registration failed. Please try again.' },
      { status: 500 }
    )
  }
}
