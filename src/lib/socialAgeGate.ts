import { isBirthdayAtLeastAge, normalizeAgeRequirement, type AgeRequirement } from '@/lib/birthday'
import { prisma } from '@/lib/prisma'
import { getFirstMediaDetailSetting } from '@/lib/mediaDetailSetting'

/** Apple App Store: social media capabilities must be disabled for anyone under 13. */
export const SOCIAL_MEDIA_MIN_AGE = 13

export type SocialAgeAccess = {
  socialMediaAllowed: boolean
  accountMeetsMinAge: boolean
  ageRequirement: AgeRequirement
  birthdayPresent: boolean
  reason: 'allowed' | 'under_social_min_age' | 'no_birthday' | 'unauthenticated'
}

export async function getPlatformAgeRequirement(): Promise<AgeRequirement> {
  try {
    const setting = await getFirstMediaDetailSetting()
    const raw = (setting as { shareAppsEnabled?: unknown } | null)?.shareAppsEnabled
    const auth =
      raw &&
      typeof raw === 'object' &&
      !Array.isArray(raw) &&
      (raw as Record<string, unknown>).__auth &&
      typeof (raw as Record<string, unknown>).__auth === 'object' &&
      !Array.isArray((raw as Record<string, unknown>).__auth)
        ? ((raw as Record<string, unknown>).__auth as Record<string, unknown>)
        : null
    return normalizeAgeRequirement(auth?.ageRequirement)
  } catch {
    return 13
  }
}

/**
 * Effective minimum for social UGC features is max(platform registration age, Apple social floor of 13).
 */
export function socialMediaMinAge(platformAgeRequirement: AgeRequirement): number {
  return Math.max(platformAgeRequirement, SOCIAL_MEDIA_MIN_AGE)
}

export async function getSocialAgeAccessForUser(userId: string | null | undefined): Promise<SocialAgeAccess> {
  const ageRequirement = await getPlatformAgeRequirement()
  if (!userId) {
    return {
      socialMediaAllowed: false,
      accountMeetsMinAge: false,
      ageRequirement,
      birthdayPresent: false,
      reason: 'unauthenticated',
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { birthday: true },
  })
  const birthdayIso = user?.birthday ? user.birthday.toISOString().slice(0, 10) : null
  if (!birthdayIso) {
    return {
      socialMediaAllowed: false,
      accountMeetsMinAge: false,
      ageRequirement,
      birthdayPresent: false,
      reason: 'no_birthday',
    }
  }

  const minAge = socialMediaMinAge(ageRequirement)
  const accountMeetsMinAge = isBirthdayAtLeastAge(birthdayIso, minAge)
  return {
    socialMediaAllowed: accountMeetsMinAge,
    accountMeetsMinAge,
    ageRequirement,
    birthdayPresent: true,
    reason: accountMeetsMinAge ? 'allowed' : 'under_social_min_age',
  }
}

/** Returns a 403 JSON response when the user may not use social / UGC features. */
export async function socialMediaForbiddenResponse(userId: string | null | undefined) {
  const access = await getSocialAgeAccessForUser(userId)
  if (access.socialMediaAllowed) return null
  const minAge = socialMediaMinAge(access.ageRequirement)
  return Response.json(
    {
      error: `Social media features are unavailable under age ${minAge}.`,
      code: 'SOCIAL_AGE_RESTRICTED',
      ...access,
    },
    { status: 403 }
  )
}
