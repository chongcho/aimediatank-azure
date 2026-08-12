'use client'

import { useEffect, useRef, useState } from 'react'
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
}

/**
 * Locale-friendly date field for iOS + Android:
 * - Type manually (ISO, Chinese 年/月/日, common slash forms)
 * - Calendar button opens the native picker
 * - Dismissing/canceling the picker leaves the text field editable
 *
 * Pure <input type="date"> on Android does not allow keyboard entry.
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
}: Props) {
  const [text, setText] = useState(value)
  const dateRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const valueIso = parseBirthdayToIso(value, { preferDayFirst })
    const textIso = parseBirthdayToIso(text, { preferDayFirst })
    if (!value && text && !textIso) return
    if (value !== text && (valueIso !== textIso || (!value && !text))) {
      setText(value)
    }
  }, [value, text, preferDayFirst])

  const isoForPicker =
    parseBirthdayToIso(text, { preferDayFirst }) ||
    parseBirthdayToIso(value, { preferDayFirst }) ||
    ''

  const openCalendar = () => {
    const el = dateRef.current
    if (!el) return
    try {
      if (typeof el.showPicker === 'function') {
        void el.showPicker()
        return
      }
    } catch {
      // NotAllowedError / unsupported — fall through
    }
    el.focus()
    el.click()
  }

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
      setText(iso)
      onChange(iso)
    }
  }

  const handleDatePicked = (iso: string) => {
    if (!iso) return
    setText(iso)
    onChange(iso)
  }

  return (
    <div className="flex w-full items-stretch gap-2">
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
      <button
        type="button"
        onClick={openCalendar}
        className="flex-shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-3 rounded-xl bg-tank-gray border border-tank-light text-white hover:bg-tank-light transition-colors"
        aria-label={calendarLabel}
        title={calendarLabel}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </button>
      <input
        ref={dateRef}
        type="date"
        value={isoForPicker}
        onChange={(e) => handleDatePicked(e.target.value)}
        tabIndex={-1}
        aria-hidden
        className="birthday-native-picker pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
      />
    </div>
  )
}
