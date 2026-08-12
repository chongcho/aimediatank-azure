'use client'

import { useEffect, useState } from 'react'
import { parseBirthdayToIso } from '@/lib/birthday'

type Props = {
  value: string
  onChange: (value: string) => void
  name?: string
  required?: boolean
  className?: string
  /** Shown in the text field when empty */
  placeholder?: string
  autoComplete?: string
  /** Accessible name for the calendar button */
  calendarLabel?: string
  /**
   * When typed numeric dates are ambiguous (e.g. 5/3/2026), prefer day/month/year
   * (UK/EU/AU) instead of US month/day/year.
   */
  preferDayFirst?: boolean
  /** Format a parsed ISO date for display (country-specific). */
  formatDisplay?: (iso: string) => string
}

/**
 * Locale-friendly date field for iOS + Android:
 * - Type manually (ISO, Chinese 年/月/日, Korean 년/월/일, EU forms)
 * - Calendar control is a real <input type="date"> overlay (iOS has no showPicker for dates)
 * - Dismissing/canceling the picker leaves the text field editable
 */
export default function FlexibleDateInput({
  value,
  onChange,
  name,
  required,
  className = 'w-full',
  placeholder = 'YYYY-MM-DD or 1990年1月15日',
  autoComplete = 'off',
  calendarLabel = 'Open calendar',
  preferDayFirst = false,
  formatDisplay,
}: Props) {
  const [text, setText] = useState(value)

  const toDisplay = (iso: string) => (formatDisplay ? formatDisplay(iso) : iso)

  useEffect(() => {
    const valueIso = parseBirthdayToIso(value, { preferDayFirst })
    const textIso = parseBirthdayToIso(text, { preferDayFirst })
    if (!value && text && !textIso) return
    if (value !== text && (valueIso !== textIso || (!value && !text))) {
      setText(value)
    }
  }, [value, text, preferDayFirst])

  // When Location-driven display style changes, reformat an already-valid date
  useEffect(() => {
    const iso = parseBirthdayToIso(text, { preferDayFirst }) || parseBirthdayToIso(value, { preferDayFirst })
    if (!iso || !formatDisplay) return
    const formatted = formatDisplay(iso)
    if (formatted && formatted !== text) {
      setText(formatted)
      if (formatted !== value) onChange(formatted)
    }
    // intentionally only when formatDisplay identity / preferDayFirst changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formatDisplay, preferDayFirst])

  const isoForPicker =
    parseBirthdayToIso(text, { preferDayFirst }) ||
    parseBirthdayToIso(value, { preferDayFirst }) ||
    ''

  const handleTextChange = (raw: string) => {
    setText(raw)
    onChange(raw)
  }

  const handleTextBlur = () => {
    const trimmed = text.trim()
    if (!trimmed) {
      setText('')
      onChange('')
      return
    }
    const iso = parseBirthdayToIso(text, { preferDayFirst })
    if (iso) {
      const display = toDisplay(iso)
      setText(display)
      onChange(display)
    }
  }

  const handleDatePicked = (iso: string) => {
    if (!iso) return
    const display = toDisplay(iso)
    setText(display)
    onChange(display)
  }

  return (
    <div className="flex w-full min-w-0 items-stretch gap-2">
      <input
        type="text"
        name={name}
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={handleTextBlur}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        inputMode="text"
        enterKeyHint="done"
        className={`min-w-0 flex-1 ${className}`.trim()}
      />
      <div className="relative flex-shrink-0 min-h-[44px] min-w-[44px]">
        <div
          className="flex h-full min-h-[44px] min-w-[44px] items-center justify-center px-3 rounded-xl bg-tank-gray border border-tank-light text-white pointer-events-none"
          aria-hidden
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </div>
        <input
          type="date"
          value={isoForPicker}
          onChange={(e) => handleDatePicked(e.target.value)}
          aria-label={calendarLabel}
          title={calendarLabel}
          className="birthday-native-picker absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  )
}
