import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSocialAgeAccessForUser, SOCIAL_MEDIA_MIN_AGE } from '@/lib/socialAgeGate'

export const dynamic = 'force-dynamic'

/**
 * Age access for social / UGC features (chat, comments, reactions, posting, sharing).
 * Enforces Apple “Social Media Disabled for Users Under 13” using account birthday
 * (plus platform ageRequirement). Native iOS also calls Declared Age Range API.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    const access = await getSocialAgeAccessForUser(session?.user?.id)
    return NextResponse.json({
      ...access,
      appleSocialMediaMinAge: SOCIAL_MEDIA_MIN_AGE,
      socialMediaDisabledUnder13: true,
    })
  } catch (error) {
    console.error('social-age-access:', error)
    return NextResponse.json({
      socialMediaAllowed: false,
      accountMeetsMinAge: false,
      ageRequirement: 13,
      birthdayPresent: false,
      reason: 'unauthenticated',
      appleSocialMediaMinAge: SOCIAL_MEDIA_MIN_AGE,
      socialMediaDisabledUnder13: true,
    })
  }
}
