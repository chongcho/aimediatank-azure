import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Mask email address for security while preserving character count
// e.g., "john@example.com" -> "j**n@e*****e.com"
function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@')
  if (!domain) return '***@***.***'
  
  // Find the last dot to separate domain name from extension
  const lastDotIndex = domain.lastIndexOf('.')
  if (lastDotIndex === -1) return '***@***.***'
  
  const domainName = domain.substring(0, lastDotIndex)
  const domainExt = domain.substring(lastDotIndex + 1)
  
  // Mask local part: show first and last character, replace middle with *
  let maskedLocal: string
  if (localPart.length <= 1) {
    maskedLocal = localPart[0] || '*'
  } else if (localPart.length === 2) {
    maskedLocal = localPart[0] + '*'
  } else {
    // Show first and last, mask the middle with exact count
    const middleLength = localPart.length - 2
    maskedLocal = localPart[0] + '*'.repeat(middleLength) + localPart[localPart.length - 1]
  }
  
  // Mask domain name: show first and last character, replace middle with *
  let maskedDomain: string
  if (domainName.length <= 1) {
    maskedDomain = domainName[0] || '*'
  } else if (domainName.length === 2) {
    maskedDomain = domainName[0] + '*'
  } else {
    // Show first and last, mask the middle with exact count
    const middleLength = domainName.length - 2
    maskedDomain = domainName[0] + '*'.repeat(middleLength) + domainName[domainName.length - 1]
  }
  
  return `${maskedLocal}@${maskedDomain}.${domainExt}`
}

// Find email by username and return masked version
export async function POST(request: Request) {
  try {
    const { username } = await request.json()

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    // Trim and validate username
    const trimmedUsername = username.trim()
    if (trimmedUsername.length < 2) {
      return NextResponse.json({ error: 'Please enter a valid username' }, { status: 400 })
    }

    // Find user by username (case-insensitive)
    const user = await prisma.user.findFirst({
      where: {
        username: {
          equals: trimmedUsername,
          mode: 'insensitive'
        }
      },
      select: {
        email: true,
        username: true,
      }
    })

    if (!user) {
      // Don't reveal if user exists or not for security
      // But in this case, we want to help the user, so we tell them
      return NextResponse.json({ 
        error: 'No account found with this username',
        found: false 
      }, { status: 404 })
    }

    // Return masked email
    const maskedEmail = maskEmail(user.email)
    
    return NextResponse.json({ 
      success: true,
      maskedEmail,
      username: user.username,
      message: 'Email found! Use this email to sign in.'
    })
  } catch (error) {
    console.error('Error in forgot-email:', error)
    return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 })
  }
}

