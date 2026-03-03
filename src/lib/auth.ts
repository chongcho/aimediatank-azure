import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import AzureADB2CProvider from 'next-auth/providers/azure-ad-b2c'
import { compare } from 'bcryptjs'
import { prisma } from './prisma'

// Build Entra External ID / Azure AD B2C provider(s) when env is configured (single-point social: Google, Facebook, Apple, Microsoft)
const ENTRA_SOCIAL_IDS = ['google', 'facebook', 'apple', 'microsoft'] as const
const ENTRA_DOMAIN_HINTS: Record<(typeof ENTRA_SOCIAL_IDS)[number], string> = {
  google: 'Google',
  facebook: 'Facebook',
  apple: 'Apple',
  microsoft: 'Microsoft',
}

function buildEntraProvider(idSuffix: string, domainHint: string) {
  const issuer = process.env.ENTRA_ISSUER
  const clientId = process.env.ENTRA_CLIENT_ID ?? process.env.AZURE_AD_B2C_CLIENT_ID
  const clientSecret = process.env.ENTRA_CLIENT_SECRET ?? process.env.AZURE_AD_B2C_CLIENT_SECRET
  if (!issuer || !clientId || !clientSecret) return null
  const id = `entra-external-id-${idSuffix}`
  const name = domainHint
  return {
    id,
    name,
    type: 'oauth' as const,
    wellKnown: `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`,
    authorization: { params: { scope: 'openid email profile', domain_hint: domainHint } },
    idToken: true,
    clientId,
    clientSecret,
    profile(profile: { sub?: string; name?: string; email?: string; emails?: string[]; picture?: string }) {
      const email = profile.email ?? (Array.isArray(profile.emails) ? profile.emails[0] : undefined)
      return {
        id: profile.sub ?? '',
        name: profile.name ?? email?.split('@')[0] ?? 'User',
        email: email ?? null,
        image: profile.picture ?? null,
      }
    },
    style: { logo: '/azure.svg', bg: '#0072c6', text: '#fff' },
  }
}

function getEntraProviders(): any[] {
  const issuer = process.env.ENTRA_ISSUER
  const clientId = process.env.ENTRA_CLIENT_ID ?? process.env.AZURE_AD_B2C_CLIENT_ID
  const clientSecret = process.env.ENTRA_CLIENT_SECRET ?? process.env.AZURE_AD_B2C_CLIENT_SECRET
  const tenantName = process.env.AZURE_AD_B2C_TENANT_NAME
  const userFlow = process.env.AZURE_AD_B2C_PRIMARY_USER_FLOW

  if (issuer && clientId && clientSecret) {
    return ENTRA_SOCIAL_IDS.map((key) => buildEntraProvider(key, ENTRA_DOMAIN_HINTS[key])).filter(
      (p): p is NonNullable<typeof p> => p !== null
    ) as any[]
  }
  if (tenantName && userFlow && clientId && clientSecret) {
    return [
      AzureADB2CProvider({
        tenantId: tenantName,
        clientId,
        clientSecret,
        primaryUserFlow: userFlow,
        authorization: { params: { scope: 'openid email profile' } },
      }) as any,
    ]
  }
  return []
}

const entraProviders = getEntraProviders()

/** Ensure unique username from email; add suffix if taken. */
async function ensureUniqueUsername(base: string): Promise<string> {
  let username = base.replace(/[^a-z0-9_]/gi, '').slice(0, 24) || 'user'
  if (!/^[a-zA-Z]/.test(username)) username = 'u' + username
  let candidate = username
  let n = 0
  while (true) {
    const existing = await prisma.user.findUnique({ where: { username: candidate } })
    if (!existing) return candidate
    candidate = `${username}${++n}`
    if (candidate.length > 32) candidate = `${username.slice(0, 28)}${n}`
  }
}

// In production, set AUTH_TRUST_HOST=true so NextAuth uses the request host for origin
// (avoids www vs non-www redirect sending users to a host that has no session cookie).
const isProductionHttps =
  typeof process.env.NEXTAUTH_URL === 'string' && process.env.NEXTAUTH_URL.startsWith('https://')

export const authOptions: NextAuthOptions = {
  useSecureCookies: isProductionHttps,
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    ...entraProviders,
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Please enter email and password')
        }

        const normalizedEmail = credentials.email.toLowerCase()

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        })

        if (!user) {
          throw new Error('No user found with this email')
        }

        const isPasswordValid = await compare(credentials.password, user.password)

        if (!isPasswordValid) {
          throw new Error('Invalid password')
        }

        if (user.isSuspended) {
          if (user.suspendedUntil && new Date(user.suspendedUntil) < new Date()) {
            await prisma.user.update({
              where: { id: user.id },
              data: {
                isSuspended: false,
                suspendedAt: null,
                suspendedUntil: null,
                suspendReason: null,
              },
            })
          } else {
            const reason = user.suspendReason || 'Policy violation'
            const until = user.suspendedUntil
              ? ` until ${new Date(user.suspendedUntil).toLocaleDateString()}`
              : ''
            throw new Error(`Account suspended${until}: ${reason}`)
          }
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          role: user.role,
          avatar: user.avatar,
        }
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      if (url.startsWith('/')) return `${baseUrl}${url}`
      try {
        const urlObj = new URL(url)
        if (urlObj.origin === baseUrl) return url
      } catch {}
      return baseUrl
    },
    async jwt({ token, user, trigger, session, account }) {
      if (user) {
        // Credentials sign-in: user has our internal id, username, role, avatar
        if (user.username !== undefined && user.role !== undefined) {
          token.id = user.id
          token.name = user.name ?? null
          token.username = user.username
          token.role = user.role
          token.avatar = user.avatar
          return token
        }
        // OAuth (Entra/B2C): find or create our User and attach to token
        const email = (user.email ?? '').toString().toLowerCase()
        if (!email) return token
        let dbUser = await prisma.user.findUnique({ where: { email } })
        if (!dbUser) {
          const username = await ensureUniqueUsername(email.split('@')[0])
          dbUser = await prisma.user.create({
            data: {
              email,
              username,
              password: '',
              name: (user.name ?? email.split('@')[0]) ?? undefined,
              emailVerified: true,
              policyAgreedAt: new Date(),
              role: 'SUBSCRIBER',
            },
          })
        }
        if (dbUser.isSuspended) {
          if (dbUser.suspendedUntil && new Date(dbUser.suspendedUntil) < new Date()) {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: {
                isSuspended: false,
                suspendedAt: null,
                suspendedUntil: null,
                suspendReason: null,
              },
            })
          } else {
            throw new Error(
              `Account suspended${dbUser.suspendedUntil ? ` until ${new Date(dbUser.suspendedUntil).toLocaleDateString()}` : ''}: ${dbUser.suspendReason || 'Policy violation'}`
            )
          }
        }
        token.id = dbUser.id
        token.name = dbUser.name ?? token.name ?? null
        token.username = dbUser.username
        token.role = dbUser.role
        token.avatar = dbUser.avatar
      }

      // Handle session updates (e.g., when username is changed)
      if (trigger === 'update' && session?.user) {
        if (session.user.username) token.username = session.user.username
        if (session.user.name) token.name = session.user.name
        if (session.user.avatar !== undefined) token.avatar = session.user.avatar
        if (session.user.role) token.role = session.user.role
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.name = (token.name as string) ?? null
        session.user.username = token.username as string
        session.user.role = token.role as string
        session.user.avatar = token.avatar as string | null
      }
      return session
    },
  },
}


