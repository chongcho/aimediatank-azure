'use client'

import FlexibleDateInput from '@/components/FlexibleDateInput'

type Props = {
  value: string
  onChange: (value: string) => void
  name?: string
  required?: boolean
  className?: string
  placeholder?: string
  autoComplete?: string
  preferDayFirst?: boolean
}

/** Birthday field with manual entry + native calendar (iOS/Android). */
export default function BirthdayInput({
  name = 'birthday',
  autoComplete = 'bday',
  placeholder = 'YYYY-MM-DD / 1990年1月15日 / 31.12.1990',
  preferDayFirst = false,
  ...rest
}: Props) {
  return (
    <FlexibleDateInput
      name={name}
      autoComplete={autoComplete}
      placeholder={placeholder}
      calendarLabel="Open birthday calendar"
      preferDayFirst={preferDayFirst}
      {...rest}
    />
  )
}
