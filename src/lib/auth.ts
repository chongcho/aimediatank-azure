import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import AzureADB2CProvider from 'next-auth/providers/azure-ad-b2c'
import { compare } from 'bcryptjs'
import { prisma } from './prisma'
import { localeTagFromUserLocation } from './localeFromLocation'
import {
  birthDateFromOAuthClaims,
  legalNameFromOAuthClaims,
  mergeOAuthProfileSources,
  pictureUrlFromOAuthClaims,
} from './oauthProfile'
import { isBirthdayAtLeastAge } from './birthday'
import { consumeNativeAuthHandoffCode, NATIVE_HANDOFF_PROVIDER_ID } from './nativeAuthHandoff'
import { getPlatformAgeRequirement } from './socialAgeGate'
import { canonicalSocialProviderId, adminSetProviderAccountId, resolveAuthMethodLabel, SOCIAL_AUTH_LABELS, type SocialAuthLabel } from './authMethodLabel'
import {
  isEntraLookupConfigured,
  isPlaceholderLegalName,
  lookupEntraUserProfile,
  mergeEntraProfileIntoUser,
} from './entraUserLookup'

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
    profile(profile: {
      sub?: string
      name?: string
      given_name?: string
      family_name?: string
      email?: string
      emails?: string[]
      picture?: string
    }) {
      const email = profile.email ?? (Array.isArray(profile.emails) ? profile.emails[0] : undefined)
      return {
        id: profile.sub ?? '',
        name: profile.name ?? email?.split('@')[0] ?? 'User',
        email: email ?? null,
        image: profile.picture ?? null,
        given_name: profile.given_name,
        family_name: profile.family_name,
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
          select: {
            id: true,
            email: true,
            name: true,
            legalName: true,
            username: true,
            role: true,
            avatar: true,
            location: true,
            password: true,
            isSuspended: true,
            suspendedUntil: true,
            suspendReason: true,
            accountDeactivatedAt: true,
          },
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

        if (user.accountDeactivatedAt) {
          throw new Error(
            'This account has been deactivated. Enter your password and tap Activate to log in, or contact support for help.',
          )
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          legalName: user.legalName,
          username: user.username,
          role: user.role,
          avatar: user.avatar,
          location: user.location,
          locale: localeTagFromUserLocation(user.location),
        }
      },
    }),
    // Native app only: redeems the one-time code produced after social sign-in completed in the
    // system browser. No secret is accepted here — the code itself is the single-use proof.
    CredentialsProvider({
      id: NATIVE_HANDOFF_PROVIDER_ID,
      name: 'Native app handoff',
      credentials: {
        code: { label: 'Handoff code', type: 'text' },
      },
      async authorize(credentials) {
        const userId = await consumeNativeAuthHandoffCode(credentials?.code ?? '')
        if (!userId) {
          throw new Error('This sign-in link has expired. Please try again.')
        }

        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            email: true,
            name: true,
            legalName: true,
            username: true,
            role: true,
            avatar: true,
            location: true,
            isSuspended: true,
            suspendedUntil: true,
            suspendReason: true,
            accountDeactivatedAt: true,
          },
        })
        if (!user) {
          throw new Error('No user found for this sign-in')
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

        if (user.accountDeactivatedAt) {
          throw new Error(
            'This account has been deactivated. Log in with email and password and tap Activate, or contact support for help.',
          )
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          legalName: user.legalName,
          username: user.username,
          role: user.role,
          avatar: user.avatar,
          location: user.location,
          locale: localeTagFromUserLocation(user.location),
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
          token.legalName = user.legalName ?? null
          token.username = user.username
          token.role = user.role
          token.avatar = user.avatar
          const u = user as { locale?: string | null; location?: string | null }
          const loc = typeof u.location === 'string' && u.location.trim() ? u.location : null
          token.locale = loc != null ? localeTagFromUserLocation(loc) : u.locale?.trim() || 'en'
          token.accountDeactivatedAt = null
          return token
        }
        // OAuth (Entra/B2C): find or create our User and attach to token
        const email = (user.email ?? '').toString().toLowerCase()
        if (!email) return token
        const mergedProfile = mergeOAuthProfileSources(user as unknown as Record<string, unknown>, account?.id_token)
        const derivedLegalName = legalNameFromOAuthClaims(mergedProfile)
        const derivedBirthday = birthDateFromOAuthClaims(mergedProfile)
        const derivedPicture =
          pictureUrlFromOAuthClaims(mergedProfile) ||
          (typeof user.image === 'string' && user.image.trim()) ||
          null
        const displayNameFromIdp =
          (typeof user.name === 'string' && user.name.trim()) ||
          derivedLegalName ||
          email.split('@')[0]

        let dbUser = await prisma.user.findUnique({ where: { email } })
        const idTokenEarly = typeof account?.id_token === 'string' ? account.id_token : null
        const socialLabelRaw = account?.provider
          ? resolveAuthMethodLabel(account.provider, idTokenEarly)
          : ''
        const socialLabel =
          SOCIAL_AUTH_LABELS.includes(socialLabelRaw as SocialAuthLabel)
            ? (socialLabelRaw as SocialAuthLabel)
            : null

        if (!dbUser) {
          const username = await ensureUniqueUsername(email.split('@')[0])
          const safeLegal =
            derivedLegalName && !isPlaceholderLegalName(derivedLegalName) ? derivedLegalName : undefined
          const safeDisplay =
            displayNameFromIdp && !isPlaceholderLegalName(displayNameFromIdp)
              ? displayNameFromIdp
              : email.split('@')[0]
          if (derivedBirthday) {
            const birthdayIso = derivedBirthday.toISOString().slice(0, 10)
            const ageRequirement = await getPlatformAgeRequirement()
            if (!isBirthdayAtLeastAge(birthdayIso, ageRequirement)) {
              throw new Error(`You must be at least ${ageRequirement} years old to register`)
            }
          }
          dbUser = await prisma.user.create({
            data: {
              email,
              username,
              password: '',
              name: safeDisplay,
              legalName: safeLegal,
              avatar: derivedPicture ?? undefined,
              birthday: derivedBirthday ?? undefined,
              emailVerified: true,
              policyAgreedAt: new Date(),
              role: 'SUBSCRIBER',
              ...(socialLabel ? { authProvider: socialLabel } : {}),
            },
          })
        } else {
          const backfill: {
            legalName?: string
            avatar?: string
            birthday?: Date
            name?: string
            authProvider?: string
          } = {}
          if (
            (isPlaceholderLegalName(dbUser.legalName) || !(dbUser.legalName && dbUser.legalName.trim())) &&
            derivedLegalName &&
            !isPlaceholderLegalName(derivedLegalName)
          ) {
            backfill.legalName = derivedLegalName
          }
          if (!(dbUser.avatar && dbUser.avatar.trim()) && derivedPicture) {
            backfill.avatar = derivedPicture
          }
          if (!dbUser.birthday && derivedBirthday) {
            const birthdayIso = derivedBirthday.toISOString().slice(0, 10)
            const ageRequirement = await getPlatformAgeRequirement()
            if (isBirthdayAtLeastAge(birthdayIso, ageRequirement)) {
              backfill.birthday = derivedBirthday
            }
          }
          if (
            (!(dbUser.name && dbUser.name.trim()) || isPlaceholderLegalName(dbUser.name)) &&
            displayNameFromIdp &&
            !isPlaceholderLegalName(displayNameFromIdp)
          ) {
            backfill.name = displayNameFromIdp
          }
          // Always refresh Sign-in network from the button they just used.
          if (socialLabel) {
            backfill.authProvider = socialLabel
          }
          if (Object.keys(backfill).length > 0) {
            dbUser = await prisma.user.update({
              where: { id: dbUser.id },
              data: backfill,
            })
          }
        }

        // Enrich missing name / phone / country from Entra Graph when available (safety / support).
        if (
          isEntraLookupConfigured() &&
          (isPlaceholderLegalName(dbUser.legalName) ||
            !(dbUser.phone && dbUser.phone.trim()) ||
            !(dbUser.location && dbUser.location.trim()) ||
            !(dbUser.authProvider && dbUser.authProvider.trim()))
        ) {
          try {
            const entra = await lookupEntraUserProfile(email)
            if (entra.ok) {
              const patch = mergeEntraProfileIntoUser(dbUser, entra.patch)
              if (socialLabel) {
                // Prefer the button they just used over Graph when both exist.
                delete patch.authProvider
              }
              if (Object.keys(patch).length > 0) {
                dbUser = await prisma.user.update({
                  where: { id: dbUser.id },
                  data: patch,
                })
              }
            }
          } catch (e) {
            console.warn('[auth] Entra profile enrich failed', e)
          }
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
        if (dbUser.accountDeactivatedAt) {
          throw new Error(
            'This account has been deactivated. If you use email and password, open Log in with Email and tap Activate after entering your password. Or contact support for help.',
          )
        }

        // Persist which social button was used (Account.provider) for admin Users column.
        // Store canonical Google/Facebook/Apple/Microsoft provider ids when resolvable.
        if (account?.provider && account.providerAccountId) {
          try {
            const idToken = typeof account.id_token === 'string' ? account.id_token : null
            const providerId =
              canonicalSocialProviderId(account.provider, idToken) || account.provider
            await prisma.account.upsert({
              where: {
                provider_providerAccountId: {
                  provider: providerId,
                  providerAccountId: String(account.providerAccountId),
                },
              },
              create: {
                userId: dbUser.id,
                type: account.type || 'oauth',
                provider: providerId,
                providerAccountId: String(account.providerAccountId),
                refresh_token: typeof account.refresh_token === 'string' ? account.refresh_token : null,
                access_token: typeof account.access_token === 'string' ? account.access_token : null,
                expires_at: typeof account.expires_at === 'number' ? account.expires_at : null,
                token_type: typeof account.token_type === 'string' ? account.token_type : null,
                scope: typeof account.scope === 'string' ? account.scope : null,
                id_token: idToken,
                session_state:
                  typeof account.session_state === 'string' ? account.session_state : null,
              },
              update: {
                userId: dbUser.id,
                refresh_token: typeof account.refresh_token === 'string' ? account.refresh_token : undefined,
                access_token: typeof account.access_token === 'string' ? account.access_token : undefined,
                expires_at: typeof account.expires_at === 'number' ? account.expires_at : undefined,
                token_type: typeof account.token_type === 'string' ? account.token_type : undefined,
                scope: typeof account.scope === 'string' ? account.scope : undefined,
                id_token: idToken ?? undefined,
                session_state:
                  typeof account.session_state === 'string' ? account.session_state : undefined,
              },
            })
            // Drop admin placeholder once a real IdP link exists.
            await prisma.account.deleteMany({
              where: {
                userId: dbUser.id,
                providerAccountId: adminSetProviderAccountId(dbUser.id),
              },
            })
          } catch (e) {
            console.error('[auth] Failed to persist OAuth Account link:', e)
          }
        }

        token.id = dbUser.id
        token.name = dbUser.name ?? token.name ?? null
        token.legalName = dbUser.legalName ?? null
        token.username = dbUser.username
        token.role = dbUser.role
        token.avatar = dbUser.avatar
        token.locale = localeTagFromUserLocation(dbUser.location)
        token.accountDeactivatedAt = null
      }

      // Backfill legalName / locale / deactivation for older JWTs
      if (
        token.id &&
        (token.legalName === undefined ||
          token.locale === undefined ||
          token.accountDeactivatedAt === undefined)
      ) {
        const u = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { legalName: true, location: true, accountDeactivatedAt: true },
        })
        if (token.legalName === undefined) {
          token.legalName = u?.legalName ?? null
        }
        if (token.locale === undefined) {
          token.locale = localeTagFromUserLocation(u?.location)
        }
        if (token.accountDeactivatedAt === undefined) {
          token.accountDeactivatedAt = u?.accountDeactivatedAt?.toISOString() ?? null
        }
      }

      // Handle session updates (e.g., when username / location is changed)
      if (trigger === 'update' && session?.user) {
        const su = session.user as { accountDeactivated?: boolean }
        if (su.accountDeactivated === true) {
          token.accountDeactivatedAt = new Date().toISOString()
        } else if (su.accountDeactivated === false && token.id) {
          const u = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { accountDeactivatedAt: true },
          })
          token.accountDeactivatedAt = u?.accountDeactivatedAt?.toISOString() ?? null
        }
        if (session.user.username) token.username = session.user.username
        if (session.user.name) token.name = session.user.name
        if (session.user.legalName !== undefined) token.legalName = session.user.legalName
        if (session.user.avatar !== undefined) token.avatar = session.user.avatar
        if (session.user.role) token.role = session.user.role
        if (session.user.locale !== undefined && session.user.locale !== null) {
          token.locale = session.user.locale
        }
        // Always re-read location → locale from DB so profile Location saves stick after refresh.
        if (token.id) {
          const u = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { location: true },
          })
          if (u) {
            token.locale = localeTagFromUserLocation(u.location)
          }
        }
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
        session.user.name = (token.name as string) ?? null
        session.user.legalName = (token.legalName as string) ?? null
        session.user.username = token.username as string
        session.user.role = token.role as string
        session.user.avatar = token.avatar as string | null
        session.user.locale = (token.locale as string | null | undefined) ?? null
        session.user.accountDeactivated = Boolean(token.accountDeactivatedAt)
      }
      return session
    },
  },
}


