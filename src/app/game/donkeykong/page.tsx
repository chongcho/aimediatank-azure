'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { donkeyKongSounds, resumeAudio } from '@/lib/gameSound'

const GAME_WIDTH = 400
const GAME_HEIGHT = 500
const PLAYER_SIZE = 24
const BARREL_SIZE = 20
const GRAVITY = 0.5
const JUMP_FORCE = -12
const MOVE_SPEED = 4
const CLIMB_SPEED = 3
const BARREL_SPEED = 2.5

// Platform layout
const PLATFORMS = [
  // Ground
  { x: 0, y: 470, width: 400, height: 30 },
  // Level 1
  { x: 0, y: 390, width: 340, height: 15 },
  // Level 2
  { x: 60, y: 310, width: 340, height: 15 },
  // Level 3
  { x: 0, y: 230, width: 340, height: 15 },
  // Level 4
  { x: 60, y: 150, width: 340, height: 15 },
  // Top platform (goal)
  { x: 0, y: 70, width: 150, height: 15 },
]

// Ladders
const LADDERS = [
  { x: 300, y: 390, height: 80 },
  { x: 80, y: 310, height: 80 },
  { x: 300, y: 230, height: 80 },
  { x: 80, y: 150, height: 80 },
  { x: 120, y: 70, height: 80 },
]

interface Player {
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
  onLadder: boolean
  climbing: boolean
}

interface Barrel {
  x: number
  y: number
  vx: number
  vy: number
  onGround: boolean
}

export default function DonkeyKongPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'start' | 'playing' | 'won' | 'lost'>('start')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [highScore, setHighScore] = useState(0)
  
  const playerRef = useRef<Player>({
    x: 30,
    y: 440,
    vx: 0,
    vy: 0,
    onGround: true,
    onLadder: false,
    climbing: false,
  })
  
  const barrelsRef = useRef<Barrel[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const gameLoopRef = useRef<number | null>(null)
  const barrelSpawnRef = useRef<NodeJS.Timeout | null>(null)

  // Load high score
  useEffect(() => {
    const saved = localStorage.getItem('donkeykong-highscore')
    if (saved) setHighScore(parseInt(saved))
  }, [])

  // Save high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score)
      localStorage.setItem('donkeykong-highscore', score.toString())
    }
  }, [score, highScore])

  const resetPlayer = useCallback(() => {
    playerRef.current = {
      x: 30,
      y: 440,
      vx: 0,
      vy: 0,
      onGround: true,
      onLadder: false,
      climbing: false,
    }
  }, [])

  const spawnBarrel = useCallback(() => {
    const barrel: Barrel = {
      x: 50,
      y: 50,
      vx: BARREL_SPEED,
      vy: 0,
      onGround: false,
    }
    barrelsRef.current.push(barrel)
  }, [])

  const checkPlatformCollision = useCallback((x: number, y: number, height: number) => {
    for (const platform of PLATFORMS) {
      if (
        x + PLAYER_SIZE > platform.x &&
        x < platform.x + platform.width &&
        y + height >= platform.y &&
        y + height <= platform.y + platform.height + 10
      ) {
        return platform
      }
    }
    return null
  }, [])

  const checkLadderCollision = useCallback((x: number, y: number) => {
    for (const ladder of LADDERS) {
      if (
        x + PLAYER_SIZE > ladder.x &&
        x < ladder.x + 20 &&
        y + PLAYER_SIZE > ladder.y &&
        y < ladder.y + ladder.height
      ) {
        return ladder
      }
    }
    return null
  }, [])

  const checkBarrelCollision = useCallback((px: number, py: number) => {
    for (const barrel of barrelsRef.current) {
      const dx = px + PLAYER_SIZE / 2 - (barrel.x + BARREL_SIZE / 2)
      const dy = py + PLAYER_SIZE / 2 - (barrel.y + BARREL_SIZE / 2)
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance < (PLAYER_SIZE + BARREL_SIZE) / 2 - 5) {
        return true
      }
    }
    return false
  }, [])

  const updateGame = useCallback(() => {
    const player = playerRef.current
    const keys = keysRef.current

    // Player movement
    if (player.climbing) {
      player.vx = 0
      player.vy = 0
      if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) {
        player.vy = -CLIMB_SPEED
      }
      if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) {
        player.vy = CLIMB_SPEED
      }
      if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) {
        player.climbing = false
      }
      if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) {
        player.climbing = false
      }
    } else {
      if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) {
        player.vx = -MOVE_SPEED
      } else if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) {
        player.vx = MOVE_SPEED
      } else {
        player.vx = 0
      }

      // Jump
      if ((keys.has('ArrowUp') || keys.has('w') || keys.has('W') || keys.has(' ')) && player.onGround) {
        donkeyKongSounds.jump()
        player.vy = JUMP_FORCE
        player.onGround = false
      }

      // Gravity
      if (!player.onGround) {
        player.vy += GRAVITY
      }
    }

    // Check ladder
    const ladder = checkLadderCollision(player.x, player.y)
    player.onLadder = !!ladder
    
    if (ladder && (keys.has('ArrowUp') || keys.has('w') || keys.has('W'))) {
      player.climbing = true
      player.vy = -CLIMB_SPEED
      player.onGround = false
    }
    
    if (player.climbing && !ladder) {
      player.climbing = false
    }

    // Update position
    player.x += player.vx
    player.y += player.vy

    // Platform collision
    if (!player.climbing) {
      const platform = checkPlatformCollision(player.x, player.y, PLAYER_SIZE)
      if (platform && player.vy >= 0) {
        player.y = platform.y - PLAYER_SIZE
        player.vy = 0
        player.onGround = true
      }
    }

    // Boundary check
    if (player.x < 0) player.x = 0
    if (player.x > GAME_WIDTH - PLAYER_SIZE) player.x = GAME_WIDTH - PLAYER_SIZE
    if (player.y > GAME_HEIGHT) {
      // Fell off - lose life
      donkeyKongSounds.death()
      setLives(l => l - 1)
      resetPlayer()
    }

    // Check win condition (reached top)
    if (player.y < 80 && player.x < 150) {
      donkeyKongSounds.levelComplete()
      setScore(s => s + 1000 * level)
      setLevel(l => l + 1)
      resetPlayer()
      barrelsRef.current = []
    }

    // Update barrels
    barrelsRef.current = barrelsRef.current.filter(barrel => {
      // Gravity
      if (!barrel.onGround) {
        barrel.vy += GRAVITY * 0.8
      }

      barrel.x += barrel.vx
      barrel.y += barrel.vy

      // Platform collision for barrels
      for (const platform of PLATFORMS) {
        if (
          barrel.x + BARREL_SIZE > platform.x &&
          barrel.x < platform.x + platform.width &&
          barrel.y + BARREL_SIZE >= platform.y &&
          barrel.y + BARREL_SIZE <= platform.y + platform.height + 10 &&
          barrel.vy >= 0
        ) {
          barrel.y = platform.y - BARREL_SIZE
          barrel.vy = 0
          barrel.onGround = true
          
          // Check if barrel should fall
          const atLeftEdge = barrel.x <= platform.x
          const atRightEdge = barrel.x + BARREL_SIZE >= platform.x + platform.width
          
          if (atLeftEdge || atRightEdge) {
            barrel.onGround = false
            barrel.vx = -barrel.vx // Change direction
          }
        }
      }

      // Remove if off screen
      if (barrel.y > GAME_HEIGHT + 50) {
        donkeyKongSounds.points()
        setScore(s => s + 100) // Points for dodging
        return false
      }

      return true
    })

    // Check barrel collision with player
    if (checkBarrelCollision(player.x, player.y)) {
      donkeyKongSounds.death()
      setLives(l => l - 1)
      resetPlayer()
      barrelsRef.current = []
    }
  }, [checkPlatformCollision, checkLadderCollision, checkBarrelCollision, resetPlayer, level])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Draw platforms
    ctx.fillStyle = '#8B4513'
    for (const platform of PLATFORMS) {
      ctx.fillRect(platform.x, platform.y, platform.width, platform.height)
      // Platform detail
      ctx.fillStyle = '#654321'
      ctx.fillRect(platform.x, platform.y, platform.width, 3)
      ctx.fillStyle = '#8B4513'
    }

    // Draw ladders
    ctx.fillStyle = '#4ECDC4'
    for (const ladder of LADDERS) {
      // Ladder rails
      ctx.fillRect(ladder.x, ladder.y, 4, ladder.height)
      ctx.fillRect(ladder.x + 16, ladder.y, 4, ladder.height)
      // Ladder rungs
      for (let i = 0; i < ladder.height; i += 15) {
        ctx.fillRect(ladder.x, ladder.y + i, 20, 3)
      }
    }

    // Draw Donkey Kong (simplified)
    ctx.fillStyle = '#8B4513'
    ctx.fillRect(30, 30, 50, 40)
    ctx.fillStyle = '#654321'
    ctx.fillRect(35, 35, 15, 10)
    ctx.fillRect(55, 35, 15, 10)
    ctx.fillStyle = '#fff'
    ctx.fillRect(40, 38, 5, 5)
    ctx.fillRect(60, 38, 5, 5)

    // Draw Princess (goal)
    ctx.fillStyle = '#FF69B4'
    ctx.fillRect(60, 45, 20, 25)
    ctx.fillStyle = '#FFD700'
    ctx.fillRect(65, 35, 10, 12)

    // Draw barrels
    ctx.fillStyle = '#8B0000'
    for (const barrel of barrelsRef.current) {
      ctx.beginPath()
      ctx.arc(barrel.x + BARREL_SIZE / 2, barrel.y + BARREL_SIZE / 2, BARREL_SIZE / 2, 0, Math.PI * 2)
      ctx.fill()
      // Barrel stripes
      ctx.strokeStyle = '#654321'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(barrel.x + 3, barrel.y + BARREL_SIZE / 2)
      ctx.lineTo(barrel.x + BARREL_SIZE - 3, barrel.y + BARREL_SIZE / 2)
      ctx.stroke()
    }

    // Draw player
    const player = playerRef.current
    // Body
    ctx.fillStyle = '#FF6B6B'
    ctx.fillRect(player.x + 4, player.y + 8, 16, 12)
    // Head
    ctx.fillStyle = '#FFE4C4'
    ctx.fillRect(player.x + 6, player.y, 12, 10)
    // Hat
    ctx.fillStyle = '#FF0000'
    ctx.fillRect(player.x + 4, player.y - 2, 16, 4)
    // Legs
    ctx.fillStyle = '#4169E1'
    ctx.fillRect(player.x + 5, player.y + 18, 5, 6)
    ctx.fillRect(player.x + 14, player.y + 18, 5, 6)
  }, [])

  const gameLoop = useCallback(() => {
    if (gameState === 'playing') {
      updateGame()
      draw()
    }
    gameLoopRef.current = requestAnimationFrame(gameLoop)
  }, [gameState, updateGame, draw])

  // Start game loop
  useEffect(() => {
    if (gameState === 'playing') {
      gameLoopRef.current = requestAnimationFrame(gameLoop)
      
      // Spawn barrels periodically
      barrelSpawnRef.current = setInterval(() => {
        if (barrelsRef.current.length < 5) {
          spawnBarrel()
        }
      }, 2000 - Math.min(level * 200, 1500))
    }

    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current)
      if (barrelSpawnRef.current) clearInterval(barrelSpawnRef.current)
    }
  }, [gameState, gameLoop, spawnBarrel, level])

  // Check lives
  useEffect(() => {
    if (lives <= 0 && gameState === 'playing') {
      setGameState('lost')
    }
  }, [lives, gameState])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(e.key)) {
        e.preventDefault()
        keysRef.current.add(e.key)
      }
    }
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  const startGame = () => {
    resumeAudio()
    setGameState('playing')
    setScore(0)
    setLives(3)
    setLevel(1)
    resetPlayer()
    barrelsRef.current = []
  }

  // Initial draw
  useEffect(() => {
    draw()
  }, [draw])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-amber-950 to-gray-900 pb-8 px-4 pt-[10px] sm:pt-[50px]">
      <div className="max-w-xl mx-auto">
        {/* Stats - Mobile: Inline */}
        <div className="sm:hidden flex justify-center gap-2 mb-2">
          <div className="bg-gray-800/50 px-2 py-1 rounded-lg flex items-center gap-1">
            <span className="text-gray-400 text-[10px]">SCORE</span>
            <span className="text-white font-bold text-sm">{score.toLocaleString()}</span>
          </div>
          <div className="bg-gray-800/50 px-2 py-1 rounded-lg flex items-center gap-1">
            <span className="text-gray-400 text-[10px]">HIGH</span>
            <span className="text-yellow-400 font-bold text-sm">{highScore.toLocaleString()}</span>
          </div>
          <div className="bg-gray-800/50 px-2 py-1 rounded-lg flex items-center gap-1">
            <span className="text-gray-400 text-[10px]">LIVES</span>
            <span className="text-red-400 font-bold text-sm">{'❤️'.repeat(lives)}</span>
          </div>
          <div className="bg-gray-800/50 px-2 py-1 rounded-lg flex items-center gap-1">
            <span className="text-gray-400 text-[10px]">LVL</span>
            <span className="text-cyan-400 font-bold text-sm">{level}</span>
          </div>
        </div>

        {/* Stats - Desktop: Stacked */}
        <div className="hidden sm:flex justify-center gap-4 mb-4">
          <div className="bg-gray-800/50 px-4 py-2 rounded-lg">
            <span className="text-gray-400 text-xs">SCORE</span>
            <div className="text-white font-bold">{score.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/50 px-4 py-2 rounded-lg">
            <span className="text-gray-400 text-xs">HIGH</span>
            <div className="text-yellow-400 font-bold">{highScore.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/50 px-4 py-2 rounded-lg">
            <span className="text-gray-400 text-xs">LIVES</span>
            <div className="text-red-400 font-bold">{'❤️'.repeat(lives)}</div>
          </div>
          <div className="bg-gray-800/50 px-4 py-2 rounded-lg">
            <span className="text-gray-400 text-xs">LEVEL</span>
            <div className="text-cyan-400 font-bold">{level}</div>
          </div>
        </div>

        {/* Game Canvas - 30% smaller on mobile */}
        <div className="relative flex justify-center">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="rounded-xl border-4 border-amber-600/30 w-[280px] h-[350px] sm:w-[400px] sm:h-[500px]"
            style={{ imageRendering: 'pixelated' }}
          />

          {/* Overlays - on top of game canvas */}
          {gameState === 'start' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3">
              <div className="text-4xl">🦍</div>
              <div className="text-xl font-bold text-amber-400">DONKEY KONG</div>
              <div className="text-gray-300 text-xs text-center px-6">
                Climb ladders, dodge barrels,<br />
                rescue the princess!
              </div>
              <button
                onClick={startGame}
                className="px-6 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-white transition-colors mt-2"
              >
                START
              </button>
            </div>
          )}

          {gameState === 'lost' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3">
              <div className="text-4xl">💀</div>
              <div className="text-xl font-bold text-red-400">GAME OVER</div>
              <div className="text-gray-300 text-sm">
                Score: <span className="text-yellow-400 font-bold">{score.toLocaleString()}</span>
              </div>
              <button
                onClick={startGame}
                className="px-6 py-2 bg-amber-500 hover:bg-amber-400 rounded-lg font-bold text-white transition-colors"
              >
                PLAY AGAIN
              </button>
            </div>
          )}
        </div>

        {/* Mobile Controls - Horizontal */}
        <div className="mt-2 sm:hidden">
          <div className="flex justify-center items-center gap-2">
            <button
              onTouchStart={() => keysRef.current.add('ArrowLeft')}
              onTouchEnd={() => keysRef.current.delete('ArrowLeft')}
              className="w-14 h-14 bg-violet-600/80 rounded-xl active:bg-violet-500 flex items-center justify-center text-white font-bold text-xl"
            >
              ←
            </button>
            <button
              onTouchStart={() => keysRef.current.add('ArrowUp')}
              onTouchEnd={() => keysRef.current.delete('ArrowUp')}
              className="w-14 h-14 bg-violet-600/80 rounded-xl active:bg-violet-500 flex items-center justify-center text-white font-bold text-xl"
            >
              ↑
            </button>
            <button
              onTouchStart={() => keysRef.current.add(' ')}
              onTouchEnd={() => keysRef.current.delete(' ')}
              className="w-14 h-14 bg-yellow-400 rounded-xl active:bg-yellow-300 flex items-center justify-center text-gray-900 font-bold text-xl"
            >
              J
            </button>
            <button
              onTouchStart={() => keysRef.current.add('ArrowDown')}
              onTouchEnd={() => keysRef.current.delete('ArrowDown')}
              className="w-14 h-14 bg-violet-600/80 rounded-xl active:bg-violet-500 flex items-center justify-center text-white font-bold text-xl"
            >
              ↓
            </button>
            <button
              onTouchStart={() => keysRef.current.add('ArrowRight')}
              onTouchEnd={() => keysRef.current.delete('ArrowRight')}
              className="w-14 h-14 bg-violet-600/80 rounded-xl active:bg-violet-500 flex items-center justify-center text-white font-bold text-xl"
            >
              →
            </button>
          </div>
        </div>

        {/* Controls Info - Desktop only */}
        <div className="hidden sm:block mt-4 text-center text-gray-500 text-sm">
          <p>Arrow keys / WASD to move • Up/W or Space to jump • Climb ladders to reach the princess!</p>
        </div>

        {/* Back Link - Desktop only */}
        <div className="hidden sm:block mt-6 text-center">
          <Link
            href="/game"
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            ← Previous to Games
          </Link>
        </div>
      </div>
    </div>
  )
}
