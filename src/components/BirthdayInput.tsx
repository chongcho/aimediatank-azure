'use client'

import { useCallback } from 'react'
import FlexibleDateInput from '@/components/FlexibleDateInput'
import {
  birthdayPlaceholderFromLocation,
  formatBirthdayForLocation,
  preferDayFirstFromLocation,
} from '@/lib/birthday'

type Props = {
  value: string
  onChange: (value: string) => void
  name?: string
  required?: boolean
  className?: string
  placeholder?: string
  autoComplete?: string
  preferDayFirst?: boolean
  /** Registration / profile Location country — drives placeholder + display format */
  location?: string
}

/** Birthday field with manual entry + native calendar (iOS/Android). */
export default function BirthdayInput({
  name = 'birthday',
  autoComplete = 'bday',
  placeholder,
  preferDayFirst,
  location = '',
  ...rest
}: Props) {
  const dayFirst = preferDayFirst ?? preferDayFirstFromLocation(location)
  const ph = placeholder ?? birthdayPlaceholderFromLocation(location)
  const formatDisplay = useCallback(
    (iso: string) => formatBirthdayForLocation(iso, location),
    [location]
  )

  return (
    <FlexibleDateInput
      name={name}
      autoComplete={autoComplete}
      placeholder={ph}
      calendarLabel="Open birthday calendar"
      preferDayFirst={dayFirst}
      formatDisplay={formatDisplay}
      {...rest}
    />
  )
}
