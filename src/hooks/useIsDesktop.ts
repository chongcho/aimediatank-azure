'use client'

import { useEffect, useState } from 'react'

/** Matches TalkChat desktop breakpoint (md). */
export function useIsDesktop(breakpoint = 768) {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= breakpoint,
  )

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= breakpoint)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [breakpoint])

  return isDesktop
}
