'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface GameSetting {
  gameId: string
  name: string
  isEnabled: boolean
}

// Game card component
function GameCard({ 
  href, 
  title, 
  icon 
}: { 
  href: string
  title: string
  icon: React.ReactNode 
}) {
  return (
    <Link
      href={href}
      className="bg-[#1a1a1a] hover:bg-[#222] rounded-xl p-4 transition-all hover:scale-105 cursor-pointer flex flex-col items-center gap-3"
    >
      {/* Game Icon */}
      <div className="w-24 h-24 flex items-center justify-center">
        {icon}
      </div>
      {/* Game Title */}
      <div className="bg-[#2a2a2a] px-4 py-1.5 rounded-lg">
        <span className="text-white font-semibold text-sm">{title}</span>
      </div>
    </Link>
  )
}

// Tetris Icon Component
function TetrisIcon() {
  return (
    <div className="flex flex-col items-center gap-[2px]">
      {/* T piece */}
      <div className="flex gap-[2px]">
        <div className="w-6 h-6 bg-purple-500" />
        <div className="w-6 h-6 bg-purple-500" />
        <div className="w-6 h-6 bg-purple-500" />
      </div>
      <div className="flex gap-[2px]">
        <div className="w-6 h-6 bg-transparent" />
        <div className="w-6 h-6 bg-purple-500" />
        <div className="w-6 h-6 bg-transparent" />
      </div>
      {/* Bottom blocks */}
      <div className="flex gap-[2px]">
        <div className="w-6 h-6 bg-cyan-400" />
        <div className="w-6 h-6 bg-yellow-400" />
        <div className="w-6 h-6 bg-green-500" />
      </div>
    </div>
  )
}

// Minesweeper Icon Component
function MinesweeperIcon() {
  return (
    <div className="flex flex-col items-center gap-[2px]">
      {/* Grid with numbers and mine */}
      <div className="flex gap-[2px]">
        <div className="w-6 h-6 bg-[#2a2a2a] flex items-center justify-center text-blue-400 text-xs font-bold">1</div>
        <div className="w-6 h-6 bg-[#2a2a2a] flex items-center justify-center text-green-400 text-xs font-bold">2</div>
        <div className="w-6 h-6 bg-[#2a2a2a] flex items-center justify-center text-red-400 text-xs font-bold">1</div>
      </div>
      <div className="flex gap-[2px]">
        <div className="w-6 h-6 bg-[#2a2a2a] flex items-center justify-center text-green-400 text-xs font-bold">2</div>
        <div className="w-6 h-6 bg-red-600 flex items-center justify-center text-[10px]">💣</div>
        <div className="w-6 h-6 bg-[#2a2a2a] flex items-center justify-center text-green-400 text-xs font-bold">2</div>
      </div>
      <div className="flex gap-[2px]">
        <div className="w-6 h-6 bg-[#333] flex items-center justify-center text-[10px]">🚩</div>
        <div className="w-6 h-6 bg-[#2a2a2a] flex items-center justify-center text-green-400 text-xs font-bold">2</div>
        <div className="w-6 h-6 bg-[#333]" />
      </div>
    </div>
  )
}

// Donkey Kong Icon Component
function DonkeyKongIcon() {
  return (
    <div className="flex flex-col items-center gap-1">
      {/* Donkey Kong */}
      <div className="text-3xl">🦍</div>
      {/* Platform with barrel and player */}
      <div className="flex flex-col gap-[2px]">
        <div className="flex gap-[2px] items-end">
          <div className="w-4 h-4 bg-red-500 rounded-full" /> {/* Barrel */}
          <div className="w-8 h-1 bg-amber-700" />
          <div className="w-3 h-5 bg-red-400" /> {/* Player */}
        </div>
        <div className="w-full h-2 bg-amber-700 rounded-sm" />
      </div>
    </div>
  )
}

// Pac-Man Icon Component
function PacManIcon() {
  return (
    <div className="flex flex-col items-center gap-2">
      {/* Pac-Man */}
      <div className="relative">
        <div className="w-12 h-12 bg-yellow-400 rounded-full relative">
          {/* Mouth */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-0 h-0 
            border-t-[12px] border-t-transparent 
            border-b-[12px] border-b-transparent 
            border-r-[14px] border-r-[#1a1a1a]" />
          {/* Eye */}
          <div className="absolute top-2 right-4 w-2 h-2 bg-black rounded-full" />
        </div>
      </div>
      {/* Dots and Ghost */}
      <div className="flex items-center gap-1">
        <div className="w-1.5 h-1.5 bg-yellow-200 rounded-full" />
        <div className="w-1.5 h-1.5 bg-yellow-200 rounded-full" />
        <div className="text-lg">👻</div>
      </div>
    </div>
  )
}

// Block Breaker Icon Component
function BlockBreakerIcon() {
  return (
    <div className="flex flex-col items-center gap-1">
      {/* Bricks */}
      <div className="flex flex-col gap-[2px]">
        <div className="flex gap-[2px]">
          <div className="w-5 h-3 bg-red-500 rounded-sm" />
          <div className="w-5 h-3 bg-orange-500 rounded-sm" />
          <div className="w-5 h-3 bg-yellow-400 rounded-sm" />
        </div>
        <div className="flex gap-[2px]">
          <div className="w-5 h-3 bg-cyan-400 rounded-sm" />
          <div className="w-5 h-3 bg-green-500 rounded-sm" />
          <div className="w-5 h-3 bg-purple-500 rounded-sm" />
        </div>
        <div className="flex gap-[2px]">
          <div className="w-5 h-3 bg-red-500 rounded-sm" />
          <div className="w-5 h-3 bg-transparent" />
          <div className="w-5 h-3 bg-yellow-400 rounded-sm" />
        </div>
      </div>
      {/* Ball */}
      <div className="w-3 h-3 bg-white rounded-full mt-2" />
      {/* Paddle */}
      <div className="w-12 h-2 bg-gradient-to-r from-cyan-400 to-green-400 rounded-full mt-1" />
    </div>
  )
}

// Pong Icon Component
function PongIcon() {
  return (
    <div className="flex flex-col items-center justify-center w-20 h-20 bg-black rounded-lg border border-gray-700">
      <div className="flex items-center justify-between w-16 h-12 relative">
        {/* Left paddle (green) */}
        <div className="w-2 h-8 bg-green-500 rounded-sm" />
        {/* Center line */}
        <div className="absolute left-1/2 -translate-x-1/2 h-full flex flex-col justify-between py-1">
          <div className="w-0.5 h-1.5 bg-gray-600" />
          <div className="w-0.5 h-1.5 bg-gray-600" />
          <div className="w-0.5 h-1.5 bg-gray-600" />
          <div className="w-0.5 h-1.5 bg-gray-600" />
        </div>
        {/* Ball */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full" />
        {/* Right paddle (red) */}
        <div className="w-2 h-8 bg-red-500 rounded-sm" />
      </div>
    </div>
  )
}

// Game icons mapping
const gameIcons: Record<string, React.ReactNode> = {
  tetris: <TetrisIcon />,
  minesweeper: <MinesweeperIcon />,
  donkeykong: <DonkeyKongIcon />,
  pacman: <PacManIcon />,
  breakout: <BlockBreakerIcon />,
  pong: <PongIcon />,
}

export default function PlayPage() {
  const [games, setGames] = useState<GameSetting[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchGames = async () => {
      try {
        const res = await fetch('/api/games')
        const data = await res.json()
        setGames(data.games || [])
      } catch (error) {
        console.error('Error fetching games:', error)
        // Fallback to all games if API fails
        setGames([
          { gameId: 'tetris', name: 'Tetris', isEnabled: true },
          { gameId: 'minesweeper', name: 'Minesweeper', isEnabled: true },
          { gameId: 'donkeykong', name: 'Donkey Kong', isEnabled: true },
          { gameId: 'pacman', name: 'Pac-Man', isEnabled: true },
          { gameId: 'breakout', name: 'Block Breaker', isEnabled: true },
          { gameId: 'pong', name: 'Pong', isEnabled: true },
        ])
      } finally {
        setLoading(false)
      }
    }
    fetchGames()
  }, [])

  return (
    <div className="min-h-screen bg-[#0a0a0a] pt-[20px] sm:pt-20 pb-8 px-4">
      <div className="max-w-4xl mx-auto">

        {/* Games Grid */}
        {loading ? (
          <div className="flex flex-wrap justify-center gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-[#1a1a1a] rounded-xl p-4 w-32 h-40 animate-pulse">
                <div className="w-24 h-24 bg-[#2a2a2a] rounded mx-auto mb-3"></div>
                <div className="w-20 h-6 bg-[#2a2a2a] rounded mx-auto"></div>
              </div>
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="text-center py-20">
            <span className="text-6xl mb-4 block">🎮</span>
            <p className="text-gray-400 text-lg">No games available at the moment</p>
            <p className="text-gray-500 text-sm mt-2">Check back soon!</p>
          </div>
        ) : (
        <div className="flex flex-wrap justify-center gap-4">
            {games.map((game) => (
          <GameCard
                key={game.gameId}
                href={`/game/${game.gameId}`}
                title={game.name}
                icon={gameIcons[game.gameId] || <span className="text-4xl">🎮</span>}
          />
            ))}
        </div>
        )}

        {/* Back Link - Desktop only */}
        <div className="hidden sm:block mt-10 text-center">
          <Link
            href="/"
            className="text-gray-500 hover:text-gray-300 transition-colors text-sm"
          >
            ← Previous to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
