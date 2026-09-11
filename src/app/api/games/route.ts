import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const DEFAULT_GAMES = [
  { gameId: 'tetris', name: 'Tetris', isEnabled: true, sortOrder: 0 },
  { gameId: 'minesweeper', name: 'Minesweeper', isEnabled: true, sortOrder: 1 },
  { gameId: 'donkeykong', name: 'Donkey Kong', isEnabled: true, sortOrder: 2 },
  { gameId: 'pacman', name: 'Pac-Man', isEnabled: true, sortOrder: 3 },
  { gameId: 'breakout', name: 'Block Breaker', isEnabled: true, sortOrder: 4 },
  { gameId: 'pong', name: 'Racquetball', isEnabled: true, sortOrder: 5 },
  { gameId: 'green-read', name: 'Green Read', isEnabled: true, sortOrder: 6 },
] as const

/** Ensure newly shipped games exist for installs that already have GameSetting rows. */
async function ensureKnownGames() {
  for (const game of DEFAULT_GAMES) {
    await prisma.gameSetting.upsert({
      where: { gameId: game.gameId },
      create: { ...game },
      update: {},
    })
  }
}

// GET - Fetch enabled games (public endpoint)
export async function GET() {
  try {
    // Keep Play-page title in sync for existing installs
    await prisma.gameSetting.updateMany({
      where: { gameId: 'pong', name: { in: ['Pong', 'Table Tennis'] } },
      data: { name: 'Racquetball' },
    })

    await ensureKnownGames()

    const games = await prisma.gameSetting.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: 'asc' },
    })

    return NextResponse.json({ games })
  } catch (error) {
    console.error('Error fetching games:', error)
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    )
  }
}
