'use client'

import { useLanguageModeList } from '@/hooks/useLanguageModeText'

const SMS_OPT_IN_STRINGS = [
  'By providing your mobile number, you agree to receive SMS messages from AI Media Tank.',
] as const

/** Carrier / Azure toll-free verification: explicit SMS consent at phone collection. */
export default function SmsOptInDisclosure({
  className = '',
}: {
  /** Kept for call-site compatibility; privacy link removed from disclosure copy. */
  from?: 'register' | 'profile'
  className?: string
}) {
  const tr = useLanguageModeList(SMS_OPT_IN_STRINGS)

  return (
    <p className={`text-xs text-gray-400 leading-relaxed ${className}`.trim()}>
      {tr[0]}
    </p>
  )
}
