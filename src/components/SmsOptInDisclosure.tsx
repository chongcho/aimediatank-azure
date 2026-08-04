'use client'

import Link from 'next/link'
import { useLanguageModeList } from '@/hooks/useLanguageModeText'

const SMS_OPT_IN_STRINGS = [
  'By providing your mobile number and requesting a verification code, you agree to receive SMS messages from AI Media Tank for account verification. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help.',
  'Privacy Policy',
  'Terms of Service',
] as const

/** Carrier / Azure toll-free verification: explicit SMS consent at phone collection. */
export default function SmsOptInDisclosure({
  from = 'register',
  className = '',
}: {
  from?: 'register' | 'profile'
  className?: string
}) {
  const tr = useLanguageModeList(SMS_OPT_IN_STRINGS)

  return (
    <p className={`text-xs text-gray-400 leading-relaxed ${className}`.trim()}>
      {tr[0]}{' '}
      <Link
        href={`/privacy?from=${from}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-tank-accent hover:underline font-medium"
      >
        {tr[1]}
      </Link>
      {' · '}
      <Link
        href={`/terms?from=${from}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-tank-accent hover:underline font-medium"
      >
        {tr[2]}
      </Link>
    </p>
  )
}
