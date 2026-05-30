/**
 * Edge-safe: load Play navbar + enabled games for middleware (no Prisma). TTL cache per isolate.
 */
import { type GameRouteAccess, VALID_GAME_IDS } from '@/lib/gameRouteAccess'

const TTL_MS = 45_000

let cache: { access: GameRouteAccess; exp: number } | null = null

const defaultAccess = (): GameRouteAccess => ({
  playEnabled: true,
  enabledGameIds: new Set(VALID_GAME_IDS),
})

export async function fetchGameRouteAccess(origin: string): Promise<GameRouteAccess> {
  const now = Date.now()
  if (cache && cache.exp > now) return cache.access

  try {
    const [navbarRes, gamesRes] = await Promise.all([
      fetch(`${origin}/api/ui/navbar`, { cache: 'no-store' }),
      fetch(`${origin}/api/games`, { cache: 'no-store' }),
    ])
    if (!navbarRes.ok || !gamesRes.ok) {
      return defaultAccess()
    }

    const navbarData = (await navbarRes.json()) as {
      items?: { itemKey: string; isEnabled: boolean }[]
    }
    const gamesData = (await gamesRes.json()) as { games?: { gameId: string }[] }

    const playItem = navbarData.items?.find((i) => i.itemKey === 'play')
    const playEnabled = playItem?.isEnabled !== false
    const enabledGameIds = new Set(
      (gamesData.games ?? []).map((g) => g.gameId.toLowerCase()),
    )

    const access: GameRouteAccess = { playEnabled, enabledGameIds }
    cache = { access, exp: now + TTL_MS }
    return access
  } catch {
    return defaultAccess()
  }
}
