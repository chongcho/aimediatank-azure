/** NextAuth provider id → label on the sign-in screen, and the Entra domain_hint that skips Entra's extra IdP list. */
export const SOCIAL_PROVIDER_SIGN_IN: Record<string, { label: string; hint?: string }> = {
  'entra-external-id-google': { label: 'Google', hint: 'Google' },
  'entra-external-id-facebook': { label: 'Facebook', hint: 'facebook' },
  'entra-external-id-apple': { label: 'Apple', hint: 'apple' },
  'entra-external-id-microsoft': { label: 'Microsoft', hint: 'microsoft' },
  'entra-external-id': { label: 'Microsoft', hint: 'microsoft' },
  'azure-ad-b2c': { label: 'Microsoft' },
}

export function socialProviderSignIn(providerId: string) {
  return SOCIAL_PROVIDER_SIGN_IN[providerId] ?? null
}

const SOCIAL_RETURN_KEY = 'amt-social-return'
const SOCIAL_RETURN_MS = 60_000

/** Remember the screen that opened /auth/social so browser Back can return there. */
export function rememberSocialSignInReturn() {
  try {
    const path = window.location.pathname + window.location.search
    if (!path.startsWith('/') || path.startsWith('//')) return
    sessionStorage.setItem(SOCIAL_RETURN_KEY, JSON.stringify({ path, at: Date.now() }))
  } catch {
    /* private mode */
  }
}

/** Drop the remembered screen once the user continues to the identity provider. */
export function clearSocialSignInReturn() {
  try {
    sessionStorage.removeItem(SOCIAL_RETURN_KEY)
  } catch {
    /* private mode */
  }
}

/** Read and remove a recent return path. Null when missing, stale, or unsafe. */
export function takeSocialSignInReturn(): string | null {
  try {
    const raw = sessionStorage.getItem(SOCIAL_RETURN_KEY)
    sessionStorage.removeItem(SOCIAL_RETURN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { path?: string; at?: number }
    if (!parsed.path || typeof parsed.at !== 'number') return null
    if (Date.now() - parsed.at > SOCIAL_RETURN_MS) return null
    if (!parsed.path.startsWith('/') || parsed.path.startsWith('//') || parsed.path.includes('\\')) return null
    return parsed.path
  } catch {
    return null
  }
}
