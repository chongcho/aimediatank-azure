'use client'

import { useState } from 'react'

type Props = Omit<React.ComponentPropsWithoutRef<'input'>, 'type'> & {
  /** Override default View/Hide button classes (e.g. Sign-in modal styling). */
  toggleButtonClassName?: string
}

const defaultToggleBtn =
  'absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-tank-accent hover:text-tank-accent/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-tank-accent/40 rounded px-1.5 py-0.5'

/**
 * Password input with View / Hide toggle. Each instance keeps its own visibility state.
 */
export default function PasswordField({
  className = '',
  toggleButtonClassName,
  ...props
}: Props) {
  const [visible, setVisible] = useState(false)
  const mergedInputClass = `pr-[4.5rem] ${className}`.trim()
  const btnClass = toggleButtonClassName ?? defaultToggleBtn

  return (
    <div className="relative w-full">
      <input {...props} type={visible ? 'text' : 'password'} className={mergedInputClass} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className={btnClass}
      >
        {visible ? 'Hide' : 'View'}
      </button>
    </div>
  )
}
