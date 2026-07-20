/**
 * Maps the registration "Location" country string (see register page) to a short
 * UI language tag used for bundled translations (en, de, ja, …).
 *
 * **Empty profile location:** treated like **United States** — English only (`en`) for UI and
 * machine translation; no browser-locale override for signed-in users (see `useUiLocale`).
 */
/** UI / translate tag when `User.location` is unset — same as profile country **United States** (`en`). */
export const EMPTY_PROFILE_LOCATION_UI_LOCALE = 'en' as const
const COUNTRY_TO_UI_TAG: Record<string, string> = {
  'United States': 'en',
  'United Kingdom': 'en',
  Canada: 'en',
  Australia: 'en',
  'New Zealand': 'en',
  Ireland: 'en',
  Singapore: 'en',
  Philippines: 'fil',
  India: 'hi',
  Nigeria: 'en',
  'South Africa': 'en',
  'Hong Kong': 'zh',
  Taiwan: 'zh',
  China: 'zh',
  Japan: 'ja',
  'South Korea': 'ko',
  Germany: 'de',
  Austria: 'de',
  Switzerland: 'de',
  France: 'fr',
  Belgium: 'fr',
  Spain: 'es',
  Mexico: 'es',
  Argentina: 'es',
  Chile: 'es',
  Colombia: 'es',
  Peru: 'es',
  Brazil: 'pt',
  Portugal: 'pt',
  Italy: 'it',
  Netherlands: 'nl',
  Sweden: 'sv',
  Norway: 'no',
  Denmark: 'da',
  Finland: 'fi',
  Poland: 'pl',
  Russia: 'ru',
  Ukraine: 'uk',
  Turkey: 'tr',
  Israel: 'he',
  'United Arab Emirates': 'ar',
  'Saudi Arabia': 'ar',
  Egypt: 'ar',
  Thailand: 'th',
  Vietnam: 'vi',
  Indonesia: 'id',
  Malaysia: 'ms',
  Other: 'en',
}

const SUPPORTED = new Set([
  'en',
  'de',
  'fr',
  'es',
  'ja',
  'ko',
  'zh',
  'pt',
  'it',
  'nl',
  'sv',
  'no',
  'da',
  'fi',
  'pl',
  'ru',
  'uk',
  'tr',
  'he',
  'ar',
  'hi',
  'fil',
  'th',
  'vi',
  'id',
  'ms',
])

/** Registration country → UI language tag. Empty/whitespace → {@link EMPTY_PROFILE_LOCATION_UI_LOCALE} (US / English). */
export function localeTagFromUserLocation(location: string | null | undefined): string {
  const loc = typeof location === 'string' ? location.trim() : ''
  if (!loc) return EMPTY_PROFILE_LOCATION_UI_LOCALE
  const tag = COUNTRY_TO_UI_TAG[loc]
  if (tag && SUPPORTED.has(tag)) return tag
  return EMPTY_PROFILE_LOCATION_UI_LOCALE
}

/** Map navigator.language (e.g. fr-CA) to a supported UI tag for guests. */
export function localeTagFromBrowserLang(browserLang: string | null | undefined): string {
  if (!browserLang) return 'en'
  let primary = browserLang.split('-')[0]?.toLowerCase()
  // Tagalog browsers often report `tl`; use Filipino UI pack.
  if (primary === 'tl') primary = 'fil'
  if (primary && SUPPORTED.has(primary)) return primary
  return 'en'
}

export function isSupportedUiLocale(tag: string): boolean {
  return SUPPORTED.has(tag)
}

/**
 * Navbar language-mode menu #2 label: native country/region short name for the Local locale
 * (e.g. ja → 日本, ko → 한국). Not the word "Local".
 */
const LOCAL_MODE_LABEL_BY_TAG: Record<string, string> = {
  en: 'English',
  ja: '日本',
  ko: '한국',
  zh: '中国',
  de: 'Deutschland',
  fr: 'France',
  es: 'España',
  pt: 'Brasil',
  it: 'Italia',
  ru: 'Россия',
  ar: 'العربية',
  hi: 'भारत',
  tr: 'Türkiye',
  fil: 'Pilipinas',
  vi: 'Việt Nam',
  id: 'Indonesia',
  th: 'ไทย',
  ms: 'Malaysia',
  nl: 'Nederland',
  sv: 'Sverige',
  no: 'Norge',
  da: 'Danmark',
  fi: 'Suomi',
  pl: 'Polska',
  uk: 'Україна',
  he: 'ישראל',
}

export function localLanguageModeLabel(localeTag: string | null | undefined): string {
  const primary = (localeTag || 'en').toLowerCase().split(/[-_]/)[0] || 'en'
  return LOCAL_MODE_LABEL_BY_TAG[primary] || LOCAL_MODE_LABEL_BY_TAG.en
}

