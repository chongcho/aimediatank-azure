import { decodeJwtPayload } from '@/lib/oauthProfile'

/** Admin-facing social network names (Create Account / social buttons). */
export const SOCIAL_AUTH_LABELS = ['Google', 'Facebook', 'Apple', 'Microsoft'] as const
export type SocialAuthLabel = (typeof SOCIAL_AUTH_LABELS)[number]

const SOCIAL_PROVIDER_IDS: Record<SocialAuthLabel, string> = {
  Google: 'entra-external-id-google',
  Facebook: 'entra-external-id-facebook',
  Apple: 'entra-external-id-apple',
  Microsoft: 'entra-external-id-microsoft',
}

/**
 * Map NextAuth / Entra provider ids to admin-facing labels.
 * Provider ids look like: entra-external-id-google, azure-ad-b2c, credentials.
 */
export function authMethodLabelFromProvider(provider: string): string {
  const p = provider.trim().toLowerCase()
  if (!p) return 'OAuth'
  if (p === 'credentials') return 'Email'
  if (p.includes('google')) return 'Google'
  if (p.includes('facebook')) return 'Facebook'
  if (p.includes('apple')) return 'Apple'
  if (p.includes('microsoft') || p.endsWith('-microsoft')) return 'Microsoft'
  // Legacy single B2C / Microsoft button (no social suffix)
  if (p === 'azure-ad-b2c') return 'Microsoft'
  return 'OAuth'
}

/** Resolve Google / Facebook / Apple / Microsoft from Entra id_token idp claims. */
export function authMethodLabelFromIdToken(idToken: string | null | undefined): SocialAuthLabel | null {
  const claims = decodeJwtPayload(idToken)
  if (!claims) return null
  const idpRaw =
    (typeof claims.idp === 'string' && claims.idp) ||
    (typeof claims.identityProvider === 'string' && claims.identityProvider) ||
    ''
  const idp = idpRaw.toLowerCase()
  if (!idp) return null
  if (idp.includes('google')) return 'Google'
  if (idp.includes('facebook')) return 'Facebook'
  if (idp.includes('apple')) return 'Apple'
  if (
    idp.includes('microsoft') ||
    idp.includes('live.com') ||
    idp.includes('msa') ||
    idp.includes('windows.net') ||
    idp.includes('login.microsoftonline')
  ) {
    return 'Microsoft'
  }
  return null
}

/** Prefer NextAuth provider id; fall back to id_token idp for Google/Facebook/Apple/Microsoft. */
export function resolveAuthMethodLabel(
  provider: string | null | undefined,
  idToken?: string | null
): string {
  const fromProvider = authMethodLabelFromProvider(provider || '')
  if (fromProvider === 'Email') return 'Email'
  if (SOCIAL_AUTH_LABELS.includes(fromProvider as SocialAuthLabel)) return fromProvider
  return authMethodLabelFromIdToken(idToken) || fromProvider
}

/**
 * Canonical Account.provider id for the social network (so admin always shows
 * Google / Facebook / Apple / Microsoft instead of a generic Entra id).
 */
export function canonicalSocialProviderId(
  provider: string | null | undefined,
  idToken?: string | null
): string | null {
  if (!provider) return null
  const label = resolveAuthMethodLabel(provider, idToken)
  if (SOCIAL_AUTH_LABELS.includes(label as SocialAuthLabel)) {
    return SOCIAL_PROVIDER_IDS[label as SocialAuthLabel]
  }
  return provider
}

/**
 * Derive signup/sign-in methods for admin display.
 * Historical OAuth users may have empty password and no Account row yet.
 */
export function deriveAuthMethods(
  password: string | null | undefined,
  accounts: Array<{ provider: string; id_token?: string | null }> | null | undefined
): string[] {
  const labels = Array.from(
    new Set(
      (accounts ?? [])
        .map((a) => resolveAuthMethodLabel(a.provider, a.id_token))
        .filter(Boolean)
    )
  )
  const hasPassword = typeof password === 'string' && password.length > 0
  if (hasPassword && !labels.includes('Email')) {
    labels.push('Email')
  }
  if (labels.length === 0) {
    // Empty password + no linked Account → likely pre-tracking social signup
    return hasPassword ? ['Email'] : ['OAuth']
  }
  return labels
}
