import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      username: string
      role: string
      avatar: string | null
      legalName: string | null
      /** UI language from registration location (see `localeTagFromUserLocation`). */
      locale?: string | null
    } & DefaultSession['user']
  }

  interface User {
    id: string
    username: string
    role: string
    avatar: string | null
    legalName?: string | null
    locale?: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    username: string
    role: string
    avatar: string | null
    legalName: string | null
    locale?: string | null
  }
}


