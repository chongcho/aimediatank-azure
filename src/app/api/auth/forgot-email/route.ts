import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Mask a string portion: show first and last char, with middle letter if > 5 chars to mask
function maskPortion(str: string): string {
  if (str.length <= 1) {
    return str[0] || '*'
  } else if (str.length === 2) {
    return str[0] + '*'
  } else {
    const middleLength = str.length - 2
    
    // If more than 5 characters to mask, show a middle character
    if (middleLength > 5) {
      const middleIndex = Math.floor(str.length / 2)
      const leftStars = middleIndex - 1
      const rightStars = str.length - middleIndex - 2
      return str[0] + '*'.repeat(leftStars) + str[middleIndex] + '*'.repeat(rightStars) + str[str.length - 1]
    } else {
      // Show first and last, mask the middle with exact count
      return str[0] + '*'.repeat(middleLength) + str[str.length - 1]
    }
  }
}

// Mask email address for security while preserving character count
// e.g., "john@example.com" -> "j**n@e*****e.com"
// If > 5 consecutive *, show middle letter: "johnsmith@example.com" -> "j***s***h@e**m**e.com"
function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@')
  if (!domain) return '***@***.***'
  
  // Find the last dot to separate domain name from extension
  const lastDotIndex = domain.lastIndexOf('.')
  if (lastDotIndex === -1) return '***@***.***'
  
  const domainName = domain.substring(0, lastDotIndex)
  const domainExt = domain.substring(lastDotIndex + 1)
  
  const maskedLocal = maskPortion(localPart)
  const maskedDomain = maskPortion(domainName)
  
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
      message: 'Email found! Use this email to log in.'
    })
  } catch (error) {
    console.error('Error in forgot-email:', error)
    return NextResponse.json({ error: 'An error occurred. Please try again.' }, { status: 500 })
  }
}

