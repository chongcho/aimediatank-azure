import {
  SOCIAL_AUTH_LABELS,
  type SocialAuthLabel,
} from '@/lib/authMethodLabel'
import { legalNameFromOAuthClaims } from '@/lib/oauthProfile'

type ObjectIdentity = {
  signInType?: string
  issuer?: string
  issuerAssignedId?: string
}

type GraphUser = {
  id?: string
  mail?: string | null
  userPrincipalName?: string | null
  displayName?: string | null
  givenName?: string | null
  surname?: string | null
  mobilePhone?: string | null
  businessPhones?: string[] | null
  country?: string | null
  usageLocation?: string | null
  city?: string | null
  identities?: ObjectIdentity[]
}

/** Prisma fields we may fill from Entra Graph for admin / safety. */
export type EntraProfilePatch = {
  authProvider?: SocialAuthLabel
  legalName?: string
  name?: string
  phone?: string
  location?: string
}

const PROFILE_COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'Germany',
  'France',
  'Japan',
  'South Korea',
  'China',
  'India',
  'Brazil',
  'Mexico',
  'Spain',
  'Italy',
  'Netherlands',
  'Sweden',
  'Norway',
  'Denmark',
  'Finland',
  'Switzerland',
  'Austria',
  'Belgium',
  'Poland',
  'Ireland',
  'Portugal',
  'New Zealand',
  'Singapore',
  'Hong Kong',
  'Taiwan',
  'Thailand',
  'Vietnam',
  'Philippines',
  'Indonesia',
  'Malaysia',
  'Russia',
  'Ukraine',
  'Turkey',
  'Israel',
  'United Arab Emirates',
  'Saudi Arabia',
  'South Africa',
  'Egypt',
  'Nigeria',
  'Argentina',
  'Chile',
  'Colombia',
  'Peru',
  'Other',
] as const

const ISO_TO_COUNTRY: Record<string, (typeof PROFILE_COUNTRIES)[number]> = {
  US: 'United States',
  GB: 'United Kingdom',
  UK: 'United Kingdom',
  CA: 'Canada',
  AU: 'Australia',
  DE: 'Germany',
  FR: 'France',
  JP: 'Japan',
  KR: 'South Korea',
  CN: 'China',
  IN: 'India',
  BR: 'Brazil',
  MX: 'Mexico',
  ES: 'Spain',
  IT: 'Italy',
  NL: 'Netherlands',
  SE: 'Sweden',
  NO: 'Norway',
  DK: 'Denmark',
  FI: 'Finland',
  CH: 'Switzerland',
  AT: 'Austria',
  BE: 'Belgium',
  PL: 'Poland',
  IE: 'Ireland',
  PT: 'Portugal',
  NZ: 'New Zealand',
  SG: 'Singapore',
  HK: 'Hong Kong',
  TW: 'Taiwan',
  TH: 'Thailand',
  VN: 'Vietnam',
  PH: 'Philippines',
  ID: 'Indonesia',
  MY: 'Malaysia',
  RU: 'Russia',
  UA: 'Ukraine',
  TR: 'Turkey',
  IL: 'Israel',
  AE: 'United Arab Emirates',
  SA: 'Saudi Arabia',
  ZA: 'South Africa',
  EG: 'Egypt',
  NG: 'Nigeria',
  AR: 'Argentina',
  CL: 'Chile',
  CO: 'Colombia',
  PE: 'Peru',
}

function entraConfig() {
  const issuer = process.env.ENTRA_ISSUER?.replace(/\/$/, '') || ''
  const clientId = process.env.ENTRA_CLIENT_ID ?? process.env.AZURE_AD_B2C_CLIENT_ID ?? ''
  const clientSecret = process.env.ENTRA_CLIENT_SECRET ?? process.env.AZURE_AD_B2C_CLIENT_SECRET ?? ''
  const tenantMatch =
    issuer.match(/\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/v2\.0$/i) ||
    issuer.match(/ciamlogin\.com\/([^/]+)/i)
  const tenantId = tenantMatch?.[1] || process.env.AZURE_AD_B2C_TENANT_NAME || ''
  const ciamHost = issuer.match(/https:\/\/([^/]+\.ciamlogin\.com)/i)?.[1] || ''
  return { issuer, clientId, clientSecret, tenantId, ciamHost }
}

export function isEntraLookupConfigured(): boolean {
  const { clientId, clientSecret, tenantId } = entraConfig()
  return Boolean(clientId && clientSecret && tenantId)
}

/** True when legalName is empty or an IdP placeholder like "unknown unknown". */
export function isPlaceholderLegalName(name: string | null | undefined): boolean {
  const n = (name || '').trim().toLowerCase()
  if (!n) return true
  if (n === 'unknown' || n === 'n/a' || n === 'na' || n === 'null') return true
  if (/^unknown(\s+unknown)+$/.test(n)) return true
  return false
}

/** Map Entra objectIdentity.issuer → Google | Facebook | Apple | Microsoft */
export function socialLabelFromEntraIssuer(issuer: string | null | undefined): SocialAuthLabel | null {
  const i = (issuer || '').trim().toLowerCase()
  if (!i) return null
  if (i.includes('google')) return 'Google'
  if (i.includes('facebook')) return 'Facebook'
  if (i.includes('apple')) return 'Apple'
  if (
    i.includes('microsoft') ||
    i.includes('live.com') ||
    i.includes('msa') ||
    i.includes('windows.net') ||
    i === 'login.microsoftonline.com' ||
    i.includes('microsoftaccount')
  ) {
    return 'Microsoft'
  }
  return null
}

export function socialLabelFromEntraIdentities(
  identities: ObjectIdentity[] | null | undefined
): SocialAuthLabel | null {
  for (const identity of identities ?? []) {
    if ((identity.signInType || '').toLowerCase() !== 'federated') continue
    const label = socialLabelFromEntraIssuer(identity.issuer)
    if (label) return label
  }
  for (const identity of identities ?? []) {
    const label = socialLabelFromEntraIssuer(identity.issuer)
    if (label && SOCIAL_AUTH_LABELS.includes(label)) return label
  }
  return null
}

/** Map Graph country / usageLocation (ISO or name) → registration country string. */
export function locationFromEntraCountry(
  country: string | null | undefined,
  usageLocation: string | null | undefined
): string | null {
  const raw = (country || usageLocation || '').trim()
  if (!raw) return null
  const iso = raw.toUpperCase()
  if (ISO_TO_COUNTRY[iso]) return ISO_TO_COUNTRY[iso]
  const byName = PROFILE_COUNTRIES.find((c) => c.toLowerCase() === raw.toLowerCase())
  if (byName) return byName
  // Graph sometimes returns "United States of America"
  if (/united states/i.test(raw)) return 'United States'
  if (/united kingdom|great britain/i.test(raw)) return 'United Kingdom'
  if (/korea/i.test(raw) && !/north/i.test(raw)) return 'South Korea'
  return 'Other'
}

function phoneFromGraphUser(user: GraphUser): string | null {
  const mobile = (user.mobilePhone || '').trim()
  if (mobile) return mobile
  const business = (user.businessPhones || []).map((p) => p.trim()).find(Boolean)
  return business || null
}

function legalNameFromGraphUser(user: GraphUser): string | null {
  const fromParts = legalNameFromOAuthClaims({
    given_name: user.givenName,
    family_name: user.surname,
    name: user.displayName,
    displayName: user.displayName,
  })
  if (fromParts && !isPlaceholderLegalName(fromParts)) return fromParts
  return null
}

function profilePatchFromGraphUser(user: GraphUser): EntraProfilePatch {
  const patch: EntraProfilePatch = {}
  const authProvider = socialLabelFromEntraIdentities(user.identities)
  if (authProvider) patch.authProvider = authProvider

  const legalName = legalNameFromGraphUser(user)
  if (legalName) {
    patch.legalName = legalName
    patch.name = legalName
  } else if (user.displayName?.trim() && !isPlaceholderLegalName(user.displayName)) {
    patch.name = user.displayName.trim()
  }

  const phone = phoneFromGraphUser(user)
  if (phone) patch.phone = phone

  const location = locationFromEntraCountry(user.country, user.usageLocation)
  if (location) patch.location = location

  return patch
}

/**
 * Merge Entra fields into an existing user — only fill blanks / replace placeholder names.
 * Never overwrites a real legalName, phone, or location the user already set.
 */
export function mergeEntraProfileIntoUser(
  existing: {
    authProvider?: string | null
    legalName?: string | null
    name?: string | null
    phone?: string | null
    location?: string | null
  },
  patch: EntraProfilePatch
): EntraProfilePatch {
  const out: EntraProfilePatch = {}
  if (patch.authProvider && !(existing.authProvider && existing.authProvider.trim())) {
    out.authProvider = patch.authProvider
  }

  if (patch.legalName && isPlaceholderLegalName(existing.legalName)) {
    out.legalName = patch.legalName
  }
  if (patch.name && (!(existing.name && existing.name.trim()) || isPlaceholderLegalName(existing.name))) {
    out.name = patch.name
  }
  if (patch.phone && !(existing.phone && existing.phone.trim())) {
    out.phone = patch.phone
  }
  if (patch.location && !(existing.location && existing.location.trim())) {
    out.location = patch.location
  }
  return out
}

async function getGraphAccessToken(): Promise<{ token: string } | { error: string }> {
  const { clientId, clientSecret, tenantId, ciamHost } = entraConfig()
  if (!clientId || !clientSecret || !tenantId) {
    return {
      error:
        'Entra is not configured (need ENTRA_ISSUER, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET).',
    }
  }

  const tokenUrls = [
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    ...(ciamHost ? [`https://${ciamHost}/${tenantId}/oauth2/v2.0/token`] : []),
  ]

  let lastError = 'Failed to get Graph token'
  for (const url of tokenUrls) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          scope: 'https://graph.microsoft.com/.default',
          grant_type: 'client_credentials',
        }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        access_token?: string
        error?: string
        error_description?: string
      }
      if (res.ok && data.access_token) {
        return { token: data.access_token }
      }
      lastError =
        data.error_description || data.error || `Graph token HTTP ${res.status}`
    } catch (e) {
      lastError = e instanceof Error ? e.message : 'Graph token request failed'
    }
  }
  return { error: lastError }
}

async function graphGetUsers(
  token: string,
  filter: string
): Promise<{ users: GraphUser[] } | { error: string }> {
  const url = new URL('https://graph.microsoft.com/v1.0/users')
  url.searchParams.set(
    '$select',
    [
      'id',
      'mail',
      'userPrincipalName',
      'displayName',
      'givenName',
      'surname',
      'mobilePhone',
      'businessPhones',
      'country',
      'usageLocation',
      'city',
      'identities',
    ].join(',')
  )
  url.searchParams.set('$filter', filter)
  url.searchParams.set('$top', '5')

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, ConsistencyLevel: 'eventual' },
  })
  const data = (await res.json().catch(() => ({}))) as {
    value?: GraphUser[]
    error?: { message?: string; code?: string }
  }
  if (!res.ok) {
    const msg = data.error?.message || `Graph users HTTP ${res.status}`
    if (res.status === 403 || data.error?.code === 'Authorization_RequestDenied') {
      return {
        error:
          'Entra app needs Microsoft Graph application permission User.Read.All (admin consent). ' +
          msg,
      }
    }
    return { error: msg }
  }
  return { users: data.value ?? [] }
}

/**
 * Look up a customer in Entra External ID and return Sign-in network plus any
 * Graph profile fields useful for admin / safety (name, phone, country).
 */
export async function lookupEntraUserProfile(email: string): Promise<
  | { ok: true; patch: EntraProfilePatch; identities: ObjectIdentity[]; graphUserId?: string }
  | { ok: false; error: string }
> {
  const normalized = email.trim().toLowerCase()
  if (!normalized || !normalized.includes('@')) {
    return { ok: false, error: 'Valid email required' }
  }

  const tokenResult = await getGraphAccessToken()
  if ('error' in tokenResult) return { ok: false, error: tokenResult.error }

  const escaped = normalized.replace(/'/g, "''")
  const attempts = [
    `mail eq '${escaped}'`,
    `identities/any(i:i/issuerAssignedId eq '${escaped}')`,
  ]

  let lastError = 'User not found in Entra'
  for (const filter of attempts) {
    const result = await graphGetUsers(tokenResult.token, filter)
    if ('error' in result) {
      lastError = result.error
      if (result.error.includes('User.Read.All')) {
        return { ok: false, error: result.error }
      }
      continue
    }
    const user = result.users[0]
    if (!user) continue
    const patch = profilePatchFromGraphUser(user)
    if (!patch.authProvider && !patch.legalName && !patch.phone && !patch.location) {
      return {
        ok: false,
        error:
          'Entra user found, but no Sign-in network, name, phone, or country fields were available.',
      }
    }
    return {
      ok: true,
      patch,
      identities: user.identities ?? [],
      graphUserId: user.id,
    }
  }

  return { ok: false, error: lastError }
}

/** @deprecated Prefer lookupEntraUserProfile — kept for callers that only need Sign-in. */
export async function lookupSocialAuthProviderFromEntra(
  email: string
): Promise<
  | { ok: true; authProvider: SocialAuthLabel; identities: ObjectIdentity[] }
  | { ok: false; error: string }
> {
  const result = await lookupEntraUserProfile(email)
  if (!result.ok) return result
  if (!result.patch.authProvider) {
    return {
      ok: false,
      error:
        'Entra user found, but no Google/Facebook/Apple/Microsoft federated identity on the account.',
    }
  }
  return {
    ok: true,
    authProvider: result.patch.authProvider,
    identities: result.identities,
  }
}
