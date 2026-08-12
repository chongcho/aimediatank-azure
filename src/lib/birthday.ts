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

/** How birthday should be shown / suggested for a registration Location. */
export type BirthdayDateStyle = 'mdy' | 'dmy' | 'dmy-dot' | 'ymd' | 'zh' | 'ko'

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

const STYLE_ZH = new Set(['China', 'Taiwan', 'Hong Kong', 'Japan'])
const STYLE_KO = new Set(['South Korea'])
const STYLE_YMD = new Set(['Sweden'])
const STYLE_DMY_DOT = new Set([
  'Germany',
  'Austria',
  'Switzerland',
  'Poland',
  'Russia',
  'Ukraine',
  'Norway',
  'Denmark',
  'Finland',
])

/** Prefer DMY for most registration countries; MDY for US/Canada/Philippines (and empty → US default). */
export function preferDayFirstFromLocation(location: string | null | undefined): boolean {
  const style = birthdayDateStyleFromLocation(location)
  return style === 'dmy' || style === 'dmy-dot'
}

export function birthdayDateStyleFromLocation(location: string | null | undefined): BirthdayDateStyle {
  const loc = typeof location === 'string' ? location.trim() : ''
  if (!loc || MONTH_FIRST_LOCATIONS.has(loc)) return 'mdy'
  if (STYLE_ZH.has(loc)) return 'zh'
  if (STYLE_KO.has(loc)) return 'ko'
  if (STYLE_YMD.has(loc)) return 'ymd'
  if (STYLE_DMY_DOT.has(loc)) return 'dmy-dot'
  return 'dmy'
}

export function birthdayPlaceholderFromLocation(location: string | null | undefined): string {
  switch (birthdayDateStyleFromLocation(location)) {
    case 'mdy':
      return 'MM/DD/YYYY'
    case 'dmy':
      return 'DD/MM/YYYY'
    case 'dmy-dot':
      return 'DD.MM.YYYY'
    case 'ymd':
      return 'YYYY-MM-DD'
    case 'zh':
      return '1990年1月15日'
    case 'ko':
      return '1990년 1월 15일'
  }
}

/** Format an ISO YYYY-MM-DD (or parseable date) for the Location's display style. */
export function formatBirthdayForLocation(
  raw: string | null | undefined,
  location: string | null | undefined
): string {
  const style = birthdayDateStyleFromLocation(location)
  const iso = parseBirthdayToIso(raw, {
    preferDayFirst: style === 'dmy' || style === 'dmy-dot',
  })
  if (!iso) return (raw || '').trim()
  const [ys, ms, ds] = iso.split('-')
  const y = Number(ys)
  const mo = Number(ms)
  const day = Number(ds)
  switch (style) {
    case 'mdy':
      return `${pad2(mo)}/${pad2(day)}/${y}`
    case 'dmy':
      return `${pad2(day)}/${pad2(mo)}/${y}`
    case 'dmy-dot':
      return `${pad2(day)}.${pad2(mo)}.${y}`
    case 'ymd':
      return iso
    case 'zh':
      return `${y}年${mo}月${day}日`
    case 'ko':
      return `${y}년 ${mo}월 ${day}일`
  }
}

function parseDayMonthYearAmbiguous(
  a: number,
  b: number,
  year: number,
  preferDayFirst: boolean
): string | null {
  if (a > 12) return toIsoIfValid(year, b, a)
  if (b > 12) return toIsoIfValid(year, a, b)
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

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s)
  if (m) return toIsoIfValid(Number(m[1]), Number(m[2]), Number(m[3]))

  m = /^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?\s*$/.exec(s)
  if (m) return toIsoIfValid(Number(m[1]), Number(m[2]), Number(m[3]))

  m = /^(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일?\s*$/.exec(s)
  if (m) return toIsoIfValid(Number(m[1]), Number(m[2]), Number(m[3]))

  m = /^(\d{4})[/.](\d{1,2})[/.](\d{1,2})$/.exec(s)
  if (m) return toIsoIfValid(Number(m[1]), Number(m[2]), Number(m[3]))

  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s)
  if (m) {
    return parseDayMonthYearAmbiguous(Number(m[1]), Number(m[2]), Number(m[3]), true)
  }

  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(s)
  if (m) {
    return parseDayMonthYearAmbiguous(Number(m[1]), Number(m[2]), Number(m[3]), preferDayFirst)
  }

  return null
}

export function parseBirthdayToDate(
  raw: string | null | undefined,
  options?: ParseDateOptions
): Date | null {
  const iso = parseBirthdayToIso(raw, options)
  return iso ? new Date(`${iso}T00:00:00.000Z`) : null
}

export function isValidBirthdayInput(
  raw: string | null | undefined,
  options?: ParseDateOptions
): boolean {
  return parseBirthdayToIso(raw, options) != null
}

/** Platform minimum age for registration / profile birthday (admin-configurable). */
export type AgeRequirement = 9 | 13 | 16 | 18

const AGE_REQUIREMENT_VALUES: readonly AgeRequirement[] = [9, 13, 16, 18]

export function normalizeAgeRequirement(value: unknown): AgeRequirement {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  if ((AGE_REQUIREMENT_VALUES as readonly number[]).includes(n)) {
    return n as AgeRequirement
  }
  return 13
}

/**
 * True if the birthday is at least `minAge` years old as of `asOf` (local calendar date).
 */
export function isBirthdayAtLeastAge(
  raw: string | null | undefined,
  minAge: number,
  options?: ParseDateOptions,
  asOf: Date = new Date()
): boolean {
  const iso = parseBirthdayToIso(raw, options)
  if (!iso) return false
  const [ys, ms, ds] = iso.split('-')
  const birth = new Date(Number(ys), Number(ms) - 1, Number(ds))
  if (Number.isNaN(birth.getTime())) return false
  let age = asOf.getFullYear() - birth.getFullYear()
  const monthDiff = asOf.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < birth.getDate())) {
    age -= 1
  }
  return age >= minAge
}
