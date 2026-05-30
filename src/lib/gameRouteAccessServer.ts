import { prisma } from '@/lib/prisma'
import { type GameRouteAccess, VALID_GAME_IDS } from '@/lib/gameRouteAccess'

/** Server-side settings (sitemap, etc.). Mirrors /api/games + navbar play toggle. */
export async function getGameRouteAccessFromDb(): Promise<GameRouteAccess> {
  try {
    const [playRow, games, count] = await Promise.all([
      prisma.navbarMenuSetting.findUnique({
        where: { itemKey: 'play' },
        select: { isEnabled: true },
      }),
      prisma.gameSetting.findMany({
        where: { isEnabled: true },
        select: { gameId: true },
      }),
      prisma.gameSetting.count(),
    ])

    const playEnabled = playRow?.isEnabled !== false
    const enabledGameIds =
      count === 0
        ? new Set<string>(VALID_GAME_IDS)
        : new Set(games.map((g) => g.gameId.toLowerCase()))

    return { playEnabled, enabledGameIds }
  } catch {
    return {
      playEnabled: true,
      enabledGameIds: new Set(VALID_GAME_IDS),
    }
  }
}
