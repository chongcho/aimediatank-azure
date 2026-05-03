/**
 * Helpers to map OIDC / social sign-in claims into our User fields.
 * Google via Entra External ID or Azure AD B2C typically exposes name, given_name,
 * family_name, picture; birthdate is rarely present without extra scopes.
 */

export function decodeJwtPayload(token: string | undefined | null): Record<string, unknown> | null {
  if (!token || typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length < 2) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Collapse a single-token display name into a valid "first + last" style legalName. */
function legalNameFromDisplayNameOnly(displayName: string): string | null {
  const parts = displayName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return null
  if (parts.length === 1) return `${parts[0]} ${parts[0]}`
  return parts.join(' ')
}

/**
 * Preferred full name for legalName from OIDC-style claims (Google, Microsoft graph-style,
 * and common Azure B2C claim URIs).
 */
export function legalNameFromOAuthClaims(c: Record<string, unknown>): string | null {
  const given =
    (typeof c.given_name === 'string' && c.given_name.trim()) ||
    (typeof c['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] === 'string' &&
      String(c['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname']).trim()) ||
    ''
  const family =
    (typeof c.family_name === 'string' && c.family_name.trim()) ||
    (typeof c['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'] === 'string' &&
      String(c['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname']).trim()) ||
    ''
  if (given || family) {
    const joined = [given, family].filter(Boolean).join(' ').trim()
    return joined || null
  }
  const name =
    (typeof c.name === 'string' && c.name.trim()) ||
    (typeof c.displayName === 'string' && c.displayName.trim()) ||
    (typeof c['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] === 'string' &&
      String(c['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name']).trim()) ||
    ''
  if (!name) return null
  return legalNameFromDisplayNameOnly(name)
}

/** OIDC birthdate claim (YYYY-MM-DD) when the IdP issues it. */
export function birthDateFromOAuthClaims(c: Record<string, unknown>): Date | null {
  const raw =
    (typeof c.birthdate === 'string' && c.birthdate.trim()) ||
    (typeof c.birthday === 'string' && c.birthday.trim()) ||
    ''
  if (!raw) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw)
  if (!iso) return null
  const y = Number(iso[1])
  const mo = Number(iso[2])
  const day = Number(iso[3])
  const d = new Date(Date.UTC(y, mo - 1, day))
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== day) return null
  return d
}

export function pictureUrlFromOAuthClaims(c: Record<string, unknown>): string | null {
  const p =
    (typeof c.picture === 'string' && c.picture.trim()) ||
    (typeof c.picture_url === 'string' && c.picture_url.trim()) ||
    ''
  return p || null
}

export function mergeOAuthProfileSources(
  user: Record<string, unknown>,
  idToken: string | undefined | null
): Record<string, unknown> {
  const idClaims = decodeJwtPayload(idToken) ?? {}
  return { ...idClaims, ...user }
}
