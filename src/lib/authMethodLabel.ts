import { decodeJwtPayload } from '@/lib/oauthProfile'

/** The four social sign-in buttons + email/password. */
export const SOCIAL_AUTH_LABELS = ['Google', 'Facebook', 'Apple', 'Microsoft'] as const
export type SocialAuthLabel = (typeof SOCIAL_AUTH_LABELS)[number]

export const SOCIAL_PROVIDER_IDS: Record<SocialAuthLabel, string> = {
  Google: 'entra-external-id-google',
  Facebook: 'entra-external-id-facebook',
  Apple: 'entra-external-id-apple',
  Microsoft: 'entra-external-id-microsoft',
}

/** Stable Account.providerAccountId for admin-assigned social links (legacy backfill). */
export function adminSetProviderAccountId(userId: string): string {
  return `admin-set-${userId}`
}

/**
 * Map NextAuth / Entra provider ids to Google | Facebook | Apple | Microsoft | Email.
 */
export function authMethodLabelFromProvider(provider: string): string {
  const p = provider.trim().toLowerCase()
  if (!p) return ''
  if (p === 'credentials') return 'Email'
  if (p.includes('google')) return 'Google'
  if (p.includes('facebook')) return 'Facebook'
  if (p.includes('apple')) return 'Apple'
  if (p.includes('microsoft') || p.endsWith('-microsoft')) return 'Microsoft'
  if (p === 'azure-ad-b2c') return 'Microsoft'
  return ''
}

/** Resolve network from Entra id_token idp claims. */
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

export function resolveAuthMethodLabel(
  provider: string | null | undefined,
  idToken?: string | null
): string {
  const fromProvider = authMethodLabelFromProvider(provider || '')
  if (fromProvider === 'Email') return 'Email'
  if (SOCIAL_AUTH_LABELS.includes(fromProvider as SocialAuthLabel)) return fromProvider
  return authMethodLabelFromIdToken(idToken) || ''
}

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

function isKnownAuthLabel(value: string): boolean {
  return value === 'Email' || SOCIAL_AUTH_LABELS.includes(value as SocialAuthLabel)
}

/**
 * Admin Sign-in column: Email and/or Google / Facebook / Apple / Microsoft.
 * Prefers User.authProvider (set at register / social sign-in).
 */
export function deriveAuthMethods(
  password: string | null | undefined,
  accounts: Array<{ provider: string; id_token?: string | null }> | null | undefined,
  authProvider?: string | null
): string[] {
  const labels: string[] = []
  const stored = typeof authProvider === 'string' ? authProvider.trim() : ''
  if (stored && isKnownAuthLabel(stored)) {
    labels.push(stored)
  }

  for (const a of accounts ?? []) {
    const label = resolveAuthMethodLabel(a.provider, a.id_token)
    if (label && !labels.includes(label)) labels.push(label)
  }

  const hasPassword = typeof password === 'string' && password.length > 0
  if (hasPassword && !labels.includes('Email')) {
    labels.push('Email')
  }
  if (labels.length === 0 && hasPassword) return ['Email']
  return labels
}

export function isSocialAuthLabel(value: string): value is SocialAuthLabel {
  return (SOCIAL_AUTH_LABELS as readonly string[]).includes(value)
}
