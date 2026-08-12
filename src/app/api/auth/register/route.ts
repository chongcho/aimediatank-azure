import { NextResponse } from 'next/server'
import { hash } from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { v4 as uuidv4 } from 'uuid'
import { BlobServiceClient } from '@azure/storage-blob'
import { parseBirthdayToIso, parseBirthdayToDate, isBirthdayAtLeastAge, normalizeAgeRequirement } from '@/lib/birthday'

// Function to generate verification token
function generateVerificationToken() {
  return uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '')
}

type ParsedAvatarData = {
  contentType: string
  buffer: Buffer
}

function parseAvatarDataUrl(input: string): ParsedAvatarData | null {
  const match = input.match(/^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/i)
  if (!match) return null
  const contentType = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase()
  const base64 = match[2]
  const buffer = Buffer.from(base64, 'base64')
  if (!buffer || buffer.length === 0) return null
  return { contentType, buffer }
}

async function uploadRegistrationAvatar(avatarDataUrl: string): Promise<string | null> {
  const parsed = parseAvatarDataUrl(avatarDataUrl)
  if (!parsed) return null
  // Guard rails for request payload abuse
  if (parsed.buffer.length > 5 * 1024 * 1024) return null

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connectionString) return null
  const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'media'
  const ext = parsed.contentType === 'image/png'
    ? 'png'
    : parsed.contentType === 'image/webp'
      ? 'webp'
      : parsed.contentType === 'image/gif'
        ? 'gif'
        : 'jpg'
  const blobName = `avatar-${uuidv4()}.${ext}`

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  const containerClient = blobServiceClient.getContainerClient(containerName)
  const blockBlobClient = containerClient.getBlockBlobClient(blobName)
  await blockBlobClient.uploadData(parsed.buffer, {
    blobHTTPHeaders: {
      blobContentType: parsed.contentType,
      blobCacheControl: 'public, max-age=31536000',
    },
  })
  return blockBlobClient.url
}

export async function POST(request: Request) {
  try {
    const { email: rawEmail, username, password, name, legalName, phone, location, bio, birthday, avatarDataUrl } = await request.json()

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

    let avatarUrl: string | null = null
    if (typeof avatarDataUrl === 'string' && avatarDataUrl.trim()) {
      try {
        avatarUrl = await uploadRegistrationAvatar(avatarDataUrl.trim())
      } catch (e) {
        console.error('Registration avatar upload failed:', e)
      }
    }

    const birthdayIso =
      birthday != null && String(birthday).trim()
        ? parseBirthdayToIso(String(birthday))
        : null
    if (!birthdayIso) {
      return NextResponse.json(
        { error: 'Please enter a valid birthday' },
        { status: 400 }
      )
    }

    let ageRequirement = 13
    try {
      const setting = await prisma.mediaDetailSetting.findFirst()
      const raw = (setting as { shareAppsEnabled?: unknown } | null)?.shareAppsEnabled
      const auth =
        raw && typeof raw === 'object' && !Array.isArray(raw) && (raw as Record<string, unknown>).__auth &&
        typeof (raw as Record<string, unknown>).__auth === 'object' &&
        !Array.isArray((raw as Record<string, unknown>).__auth)
          ? ((raw as Record<string, unknown>).__auth as Record<string, unknown>)
          : null
      ageRequirement = normalizeAgeRequirement(auth?.ageRequirement)
    } catch {
      ageRequirement = 13
    }
    if (!isBirthdayAtLeastAge(birthdayIso, ageRequirement)) {
      return NextResponse.json(
        { error: `You must be at least ${ageRequirement} years old to register` },
        { status: 400 }
      )
    }
    const birthdayDate = parseBirthdayToDate(birthdayIso)

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
          bio: bio || null,
          avatar: avatarUrl,
          birthday: birthdayDate,
          role: userRole,
          policyAgreedAt: new Date(),
          authProvider: 'Email',
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
            bio: bio || null,
            avatar: avatarUrl,
            birthday: birthdayDate,
            authProvider: 'Email',
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
    console.log(`Subject: Welcome to AI Media Tank (AMT) - Verify your email`)
    console.log(``)
    console.log(`Hello ${user.name || user.username},`)
    console.log(``)
    console.log(`Welcome to AI Media Tank (AMT)! Please click the link below to verify your email:`)
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
