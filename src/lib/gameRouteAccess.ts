/** Known game slugs under /game/{id}. */
export const VALID_GAME_IDS = [
  'tetris',
  'minesweeper',
  'donkeykong',
  'pacman',
  'breakout',
  'pong',
] as const

export type ParsedGamePath =
  | { kind: 'none' }
  | { kind: 'index' }
  | { kind: 'game'; gameId: string }

export type GameRouteAccess = {
  playEnabled: boolean
  enabledGameIds: Set<string>
}

export function parseGamePath(pathname: string): ParsedGamePath {
  if (pathname === '/game' || pathname === '/game/') return { kind: 'index' }
  const m = pathname.match(/^\/game\/([^/]+)\/?$/)
  if (m) return { kind: 'game', gameId: decodeURIComponent(m[1]).toLowerCase() }
  return { kind: 'none' }
}

/** Play navbar must be on; individual games must be enabled (admins bypass for testing). */
export function isGameRouteAllowed(
  parsed: ParsedGamePath,
  access: GameRouteAccess,
  opts?: { isAdmin?: boolean },
): boolean {
  if (parsed.kind === 'none') return true
  if (opts?.isAdmin) return true
  if (!access.playEnabled) return false
  if (parsed.kind === 'index') return true
  if (!(VALID_GAME_IDS as readonly string[]).includes(parsed.gameId)) return false
  return access.enabledGameIds.has(parsed.gameId)
}
