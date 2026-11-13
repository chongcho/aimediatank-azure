/** Mask email for UI: first 3 local chars + one `.` per remaining local char + @domain. */
export function maskEmailForDisplay(email: string): string {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.indexOf('@')
  if (at <= 0) return '...@...'
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1) || '...'
  const prefixLen = Math.min(3, local.length)
  const prefix = local.slice(0, prefixLen)
  const hiddenCount = Math.max(0, local.length - prefixLen)
  return `${prefix}${'.'.repeat(hiddenCount)}@${domain}`
}

/** Mask phone for UI status: "ending 5621" (last 4 digits). */
export function maskPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 4) return 'ending ••••'
  return `ending ${digits.slice(-4)}`
}
