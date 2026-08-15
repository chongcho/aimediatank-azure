import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET - Fetch enabled games (public endpoint)
export async function GET() {
  try {
    // Keep Play-page title in sync for existing installs
    await prisma.gameSetting.updateMany({
      where: { gameId: 'pong', name: { in: ['Pong', 'Table Tennis'] } },
      data: { name: 'Racquetball' },
    })

    let games = await prisma.gameSetting.findMany({
      where: { isEnabled: true },
      orderBy: { sortOrder: 'asc' },
    })
    
    // If no game settings exist, return all games as enabled by default
    if (games.length === 0) {
      // Check if table is empty
      const count = await prisma.gameSetting.count()
      if (count === 0) {
        // Return default games
        games = [
          { id: '1', gameId: 'tetris', name: 'Tetris', isEnabled: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() },
          { id: '2', gameId: 'minesweeper', name: 'Minesweeper', isEnabled: true, sortOrder: 1, createdAt: new Date(), updatedAt: new Date() },
          { id: '3', gameId: 'donkeykong', name: 'Donkey Kong', isEnabled: true, sortOrder: 2, createdAt: new Date(), updatedAt: new Date() },
          { id: '4', gameId: 'pacman', name: 'Pac-Man', isEnabled: true, sortOrder: 3, createdAt: new Date(), updatedAt: new Date() },
          { id: '5', gameId: 'breakout', name: 'Block Breaker', isEnabled: true, sortOrder: 4, createdAt: new Date(), updatedAt: new Date() },
          { id: '6', gameId: 'pong', name: 'Racquetball', isEnabled: true, sortOrder: 5, createdAt: new Date(), updatedAt: new Date() },
        ]
      }
    }
    
    return NextResponse.json({ games })
  } catch (error) {
    console.error('Error fetching games:', error)
    return NextResponse.json(
      { error: 'Failed to fetch games' },
      { status: 500 }
    )
  }
}
