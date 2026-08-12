/**
 * Normalize calendar date strings to ISO YYYY-MM-DD.
 * Accepts ISO, US/EU numeric forms, and CJK Gregorian labels (年/月/日, 년/월/일).
 */

export type ParseDateOptions = {
  /**
   * When a numeric date is ambiguous (both parts ≤ 12), prefer day-month-year
   * (UK/EU/AU/LatAm/India) instead of US month-day-year.
   */
  preferDayFirst?: boolean
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function toIsoIfValid(year: number, month: number, day: number): string | null {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  if (year < 1900 || year > 2100) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  const d = new Date(Date.UTC(year, month - 1, day))
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

/** Countries in our Location list that commonly type month/day/year when ambiguous. */
const MONTH_FIRST_LOCATIONS = new Set(['United States', 'Canada', 'Philippines'])

/** Prefer DMY for most registration countries; MDY for US/Canada/Philippines (and empty → US default). */
export function preferDayFirstFromLocation(location: string | null | undefined): boolean {
  const loc = typeof location === 'string' ? location.trim() : ''
  if (!loc) return false
  return !MONTH_FIRST_LOCATIONS.has(loc)
}

function parseDayMonthYearAmbiguous(
  a: number,
  b: number,
  year: number,
  preferDayFirst: boolean
): string | null {
  // Unambiguous: one part must be the day (>12)
  if (a > 12) return toIsoIfValid(year, b, a) // D/M/Y
  if (b > 12) return toIsoIfValid(year, a, b) // M/D/Y
  // Ambiguous (e.g. 5/3/2026): locale preference
  return preferDayFirst ? toIsoIfValid(year, b, a) : toIsoIfValid(year, a, b)
}

/**
 * Parse a user-entered date into YYYY-MM-DD, or null if unrecognized/invalid.
 */
export function parseBirthdayToIso(
  raw: string | null | undefined,
  options?: ParseDateOptions
): string | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (!s) return null
  const preferDayFirst = Boolean(options?.preferDayFirst)

  // Already ISO
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return toIsoIfValid(Number(m[1]), Number(m[2]), Number(m[3]))

  // Chinese / Japanese Gregorian: 2026年5月3日
  m = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*$/.exec(s)
  if (m) return toIsoIfValid(Number(m[1]), Number(m[2]), Number(m[3]))

  // Korean Gregorian: 2026년 5월 3일
  m = /^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*$/.exec(s)
  if (m) return toIsoIfValid(Number(m[1]), Number(m[2]), Number(m[3]))

  // Year-first with / or . : 2026/5/3 or 2026.5.3 (CN/JP/ISO-like)
  m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s)
  if (m) return toIsoIfValid(Number(m[1]), Number(m[2]), Number(m[3]))

  // European dotted day-first: 3.5.2026 or 03.05.2026 (DE, and many EU locales)
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s)
  if (m) {
    return parseDayMonthYearAmbiguous(Number(m[1]), Number(m[2]), Number(m[3]), true)
  }

  // Slash or dash with year last: 5/3/2026, 03-05-2026, 5-3-2026
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s)
  if (m) {
    return parseDayMonthYearAmbiguous(Number(m[1]), Number(m[2]), Number(m[3]), preferDayFirst)
  }

  return null
}

/** Parse to a UTC midnight Date, or null if invalid/empty. */
export function parseBirthdayToDate(
  raw: string | null | undefined,
  options?: ParseDateOptions
): Date | null {
  const iso = parseBirthdayToIso(raw, options)
  return iso ? new Date(`${iso}T00:00:00.000Z`) : null
}

/** True when the string parses to a real calendar date. */
export function isValidBirthdayInput(
  raw: string | null | undefined,
  options?: ParseDateOptions
): boolean {
  return parseBirthdayToIso(raw, options) != null
}
