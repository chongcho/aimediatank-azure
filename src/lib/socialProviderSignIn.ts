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
