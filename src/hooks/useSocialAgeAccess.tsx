'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useSession } from 'next-auth/react'
import {
  combineSocialAccess,
  readCachedDeclaredAgeRange,
  requestDeclaredAgeRangeForSocial,
  type DeclaredAgeRangeResult,
} from '@/lib/declaredAgeRange'

export type SocialAgeAccessState = {
  loading: boolean
  socialMediaAllowed: boolean
  accountMeetsMinAge: boolean
  ageRequirement: number
  appleSocialMediaMinAge: number
  declared: DeclaredAgeRangeResult | null
  refresh: () => Promise<void>
}

const SocialAgeAccessContext = createContext<SocialAgeAccessState | null>(null)

/**
 * Apple compliance: social / UGC only when account age ≥13 (and platform ageRequirement)
 * and, on native iOS when Declared Age Range applies, Apple also reports ≥13.
 */
export function SocialAgeAccessProvider({ children }: { children: ReactNode }) {
  const { status } = useSession()
  const [loading, setLoading] = useState(true)
  const [accountMeetsMinAge, setAccountMeetsMinAge] = useState(false)
  const [ageRequirement, setAgeRequirement] = useState(13)
  const [appleSocialMediaMinAge, setAppleSocialMediaMinAge] = useState(13)
  const [declared, setDeclared] = useState<DeclaredAgeRangeResult | null>(() =>
    readCachedDeclaredAgeRange()
  )
  const [socialMediaAllowed, setSocialMediaAllowed] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      if (status !== 'authenticated') {
        setAccountMeetsMinAge(false)
        setSocialMediaAllowed(false)
        setDeclared(readCachedDeclaredAgeRange())
        return
      }

      const res = await fetch('/api/ui/social-age-access')
      const data = await res.json()
      const accountOk = data.socialMediaAllowed === true
      setAccountMeetsMinAge(accountOk)
      setAgeRequirement(typeof data.ageRequirement === 'number' ? data.ageRequirement : 13)
      setAppleSocialMediaMinAge(
        typeof data.appleSocialMediaMinAge === 'number' ? data.appleSocialMediaMinAge : 13
      )

      let declaredResult = readCachedDeclaredAgeRange()
      if (accountOk) {
        declaredResult = await requestDeclaredAgeRangeForSocial()
        setDeclared(declaredResult)
      }
      setSocialMediaAllowed(combineSocialAccess(accountOk, declaredResult))
    } catch {
      setSocialMediaAllowed(false)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({
      loading,
      socialMediaAllowed,
      accountMeetsMinAge,
      ageRequirement,
      appleSocialMediaMinAge,
      declared,
      refresh,
    }),
    [
      loading,
      socialMediaAllowed,
      accountMeetsMinAge,
      ageRequirement,
      appleSocialMediaMinAge,
      declared,
      refresh,
    ]
  )

  return (
    <SocialAgeAccessContext.Provider value={value}>{children}</SocialAgeAccessContext.Provider>
  )
}

export function useSocialAgeAccess(): SocialAgeAccessState {
  const ctx = useContext(SocialAgeAccessContext)
  if (!ctx) {
    return {
      loading: false,
      socialMediaAllowed: false,
      accountMeetsMinAge: false,
      ageRequirement: 13,
      appleSocialMediaMinAge: 13,
      declared: null,
      refresh: async () => {},
    }
  }
  return ctx
}
