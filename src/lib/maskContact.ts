/** Mask email for UI: first 3 local chars + …@domain (e.g. jam…@aimediatank.com). */
export function maskEmailForDisplay(email: string): string {
  const trimmed = email.trim().toLowerCase()
  const at = trimmed.indexOf('@')
  if (at <= 0) return '•••@•••'
  const local = trimmed.slice(0, at)
  const domain = trimmed.slice(at + 1) || '•••'
  const prefix = local.slice(0, 3)
  return `${prefix}…@${domain}`
}

/** Mask phone for UI: first 3 digits + … + last 4 (e.g. 425…6221). */
export function maskPhoneForDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 7) {
    if (digits.length < 4) return '••••'
    return `…${digits.slice(-4)}`
  }
  return `${digits.slice(0, 3)}…${digits.slice(-4)}`
}
