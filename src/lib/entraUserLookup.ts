import {
  SOCIAL_AUTH_LABELS,
  type SocialAuthLabel,
} from '@/lib/authMethodLabel'

type ObjectIdentity = {
  signInType?: string
  issuer?: string
  issuerAssignedId?: string
}

type GraphUser = {
  id?: string
  mail?: string | null
  userPrincipalName?: string | null
  identities?: ObjectIdentity[]
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
  // Some tenants omit signInType; still try issuer on any identity.
  for (const identity of identities ?? []) {
    const label = socialLabelFromEntraIssuer(identity.issuer)
    if (label && SOCIAL_AUTH_LABELS.includes(label)) return label
  }
  return null
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
    ...(ciamHost
      ? [`https://${ciamHost}/${tenantId}/oauth2/v2.0/token`]
      : []),
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
        data.error_description ||
        data.error ||
        `Graph token HTTP ${res.status}`
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
  url.searchParams.set('$select', 'id,mail,userPrincipalName,identities')
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
 * Look up a customer in the Entra External ID tenant and return their social network
 * (Google / Facebook / Apple / Microsoft) from federated identities.
 */
export async function lookupSocialAuthProviderFromEntra(
  email: string
): Promise<
  | { ok: true; authProvider: SocialAuthLabel; identities: ObjectIdentity[] }
  | { ok: false; error: string }
> {
  const normalized = email.trim().toLowerCase()
  if (!normalized || !normalized.includes('@')) {
    return { ok: false, error: 'Valid email required' }
  }

  const tokenResult = await getGraphAccessToken()
  if ('error' in tokenResult) return { ok: false, error: tokenResult.error }

  const escaped = normalized.replace(/'/g, "''")
  // Prefer mail; also try issuerAssignedId for local/federated email identities.
  const attempts = [
    `mail eq '${escaped}'`,
    `identities/any(i:i/issuerAssignedId eq '${escaped}')`,
  ]

  let lastError = 'User not found in Entra'
  for (const filter of attempts) {
    const result = await graphGetUsers(tokenResult.token, filter)
    if ('error' in result) {
      lastError = result.error
      // Permission errors won't be fixed by another filter.
      if (result.error.includes('User.Read.All')) {
        return { ok: false, error: result.error }
      }
      continue
    }
    const user = result.users[0]
    if (!user) continue
    const label = socialLabelFromEntraIdentities(user.identities)
    if (!label) {
      return {
        ok: false,
        error:
          'Entra user found, but no Google/Facebook/Apple/Microsoft federated identity on the account.',
      }
    }
    return { ok: true, authProvider: label, identities: user.identities ?? [] }
  }

  return { ok: false, error: lastError }
}
