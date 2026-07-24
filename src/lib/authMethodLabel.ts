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
  if (p.includes('microsoft') || p === 'azure-ad-b2c' || p.endsWith('-microsoft')) return 'Microsoft'
  if (p.includes('entra') || p.includes('azure-ad')) return 'Microsoft'
  return 'OAuth'
}

/**
 * Derive signup/sign-in methods for admin display.
 * Historical OAuth users may have empty password and no Account row yet.
 */
export function deriveAuthMethods(
  password: string | null | undefined,
  accounts: Array<{ provider: string }> | null | undefined
): string[] {
  const labels = [
    ...new Set(
      (accounts ?? [])
        .map((a) => authMethodLabelFromProvider(a.provider))
        .filter(Boolean)
    ),
  ]
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
