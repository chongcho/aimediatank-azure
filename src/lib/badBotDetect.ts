/**
 * Known malicious / offensive-scanner User-Agent signals (Edge-safe).
 * Intentionally conservative: common HTTP libraries are not flagged.
 */

export const BAD_BOT_FLAG_LABELS: Record<string, string> = {
  BAD_BOT_SCANNER_UA: 'Known exploit / scanner tool User-Agent',
  BAD_BOT_UA_EMPTY: 'Missing or empty User-Agent (strict mode)',
}

/** Substrings are distinctive tool names; matched case-insensitively on normalized UA. */
const SCANNER_UA_PATTERNS: RegExp[] = [
  /\bsqlmap\b/i,
  /\bnikto\b/i,
  /\bnuclei\b/i,
  /\bacunetix\b/i,
  /\bnessus\b/i,
  /\bopenvas\b/i,
  /\bgreenbone\b/i,
  /\bw3af\b/i,
  /\bwapiti\b/i,
  /\bwhatweb\b/i,
  /\bdirbuster\b/i,
  /\bgobuster\b/i,
  /\bwfuzz\b/i,
  /\bhavij\b/i,
  /\bmasscan\b/i,
  /\bzgrab\b/i,
  /\barachni\b/i,
  /\bwpscan\b/i,
  /\bnetsparker\b/i,
  /\bappscan\b/i,
  /\bawvs\b/i,
  /\bqualys\b/i,
  /\binvicti\b/i,
  /\bprobely\b/i,
  /\bdetectify\b/i,
  /\bvulners\b/i,
  /\bmetasploit\b/i,
  /\bnmap\b/i,
  /\bshodan\b/i,
  /\bcensys\b/i,
  /\bburpsuite\b/i,
  /\bffuf\b/i,
  /\bferoxbuster\b/i,
  /\brainbowdash\b/i, // common scanner default UA
  /\bzmeu\b/i,
  /\bl9scanner\b/i,
  /\bvulnerability[_-]?scanner\b/i,
]

function normalizeUa(raw: string | null | undefined): string {
  if (raw == null) return ''
  return raw.trim().slice(0, 2048)
}

/**
 * Set `BLOCK_EMPTY_USER_AGENT=true` to treat missing/blank User-Agent as a bot signal
 * (may block unusual legitimate clients or health probes).
 */
export function detectBadBotUserAgent(userAgent: string | null | undefined): string[] {
  const ua = normalizeUa(userAgent)
  const flags = new Set<string>()

  if (!ua) {
    if (process.env.BLOCK_EMPTY_USER_AGENT === 'true') {
      flags.add('BAD_BOT_UA_EMPTY')
    }
    return Array.from(flags).sort()
  }

  for (const re of SCANNER_UA_PATTERNS) {
    if (re.test(ua)) {
      flags.add('BAD_BOT_SCANNER_UA')
      break
    }
  }

  return Array.from(flags).sort()
}
