'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { pacmanSounds, resumeAudio } from '@/lib/gameSound'

const CELL_SIZE = 20
const COLS = 19
const ROWS = 21

// 0 = empty, 1 = wall, 2 = dot, 3 = power pellet, 4 = empty (no dot)
const MAZE_TEMPLATE = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
  [1,3,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,3,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,2,1,1,1,1,1,2,1,2,1,1,2,1],
  [1,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,1],
  [1,1,1,1,2,1,1,1,4,1,4,1,1,1,2,1,1,1,1],
  [4,4,4,1,2,1,4,4,4,4,4,4,4,1,2,1,4,4,4],
  [1,1,1,1,2,1,4,1,1,4,1,1,4,1,2,1,1,1,1],
  [4,4,4,4,2,4,4,1,4,4,4,1,4,4,2,4,4,4,4],
  [1,1,1,1,2,1,4,1,1,1,1,1,4,1,2,1,1,1,1],
  [4,4,4,1,2,1,4,4,4,4,4,4,4,1,2,1,4,4,4],
  [1,1,1,1,2,1,4,1,1,1,1,1,4,1,2,1,1,1,1],
  [1,2,2,2,2,2,2,2,2,1,2,2,2,2,2,2,2,2,1],
  [1,2,1,1,2,1,1,1,2,1,2,1,1,1,2,1,1,2,1],
  [1,3,2,1,2,2,2,2,2,4,2,2,2,2,2,1,2,3,1],
  [1,1,2,1,2,1,2,1,1,1,1,1,2,1,2,1,2,1,1],
  [1,2,2,2,2,1,2,2,2,1,2,2,2,1,2,2,2,2,1],
  [1,2,1,1,1,1,1,1,2,1,2,1,1,1,1,1,1,2,1],
  [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
]

type Direction = 'up' | 'down' | 'left' | 'right'

interface Ghost {
  x: number
  y: number
  direction: Direction
  color: string
  scared: boolean
  eaten: boolean
  releaseTime: number // Frame count when ghost is released
  inHouse: boolean
}

export default function PacManPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'start' | 'playing' | 'won' | 'lost'>('start')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [highScore, setHighScore] = useState(0)
  
  const mazeRef = useRef<number[][]>([])
  const pacmanRef = useRef({ x: 9, y: 15, direction: 'left' as Direction, nextDirection: 'left' as Direction, mouthOpen: true })
  const ghostsRef = useRef<Ghost[]>([])
  const powerModeRef = useRef(false)
  const powerTimerRef = useRef<NodeJS.Timeout | null>(null)
  const gameLoopRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)

  // Load high score
  useEffect(() => {
    const saved = localStorage.getItem('pacman-highscore')
    if (saved) setHighScore(parseInt(saved))
  }, [])

  // Save high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score)
      localStorage.setItem('pacman-highscore', score.toString())
    }
  }, [score, highScore])

  const initMaze = useCallback(() => {
    mazeRef.current = MAZE_TEMPLATE.map(row => [...row])
  }, [])

  const initGhosts = useCallback(() => {
    // Ghosts start in the ghost house and are released over time
    ghostsRef.current = [
      { x: 9, y: 9, direction: 'up', color: '#FF0000', scared: false, eaten: false, releaseTime: 0, inHouse: false }, // Red - starts outside
      { x: 9, y: 10, direction: 'up', color: '#FFB8FF', scared: false, eaten: false, releaseTime: 240, inHouse: true }, // Pink - released after 4s
      { x: 8, y: 10, direction: 'up', color: '#00FFFF', scared: false, eaten: false, releaseTime: 480, inHouse: true }, // Cyan - released after 8s
      { x: 10, y: 10, direction: 'up', color: '#FFB852', scared: false, eaten: false, releaseTime: 720, inHouse: true }, // Orange - released after 12s
    ]
  }, [])

  const resetPositions = useCallback(() => {
    pacmanRef.current = { x: 9, y: 15, direction: 'left', nextDirection: 'left', mouthOpen: true }
    initGhosts()
    powerModeRef.current = false
    if (powerTimerRef.current) clearTimeout(powerTimerRef.current)
  }, [initGhosts])

  const canMove = useCallback((x: number, y: number, direction: Direction): boolean => {
    let newX = x
    let newY = y
    
    switch (direction) {
      case 'up': newY--; break
      case 'down': newY++; break
      case 'left': newX--; break
      case 'right': newX++; break
    }
    
    // Tunnel wrap
    if (newX < 0) newX = COLS - 1
    if (newX >= COLS) newX = 0
    
    if (newY < 0 || newY >= ROWS) return false
    
    return mazeRef.current[newY][newX] !== 1
  }, [])

  const getNewPosition = useCallback((x: number, y: number, direction: Direction) => {
    let newX = x
    let newY = y
    
    switch (direction) {
      case 'up': newY--; break
      case 'down': newY++; break
      case 'left': newX--; break
      case 'right': newX++; break
    }
    
    // Tunnel wrap
    if (newX < 0) newX = COLS - 1
    if (newX >= COLS) newX = 0
    
    return { x: newX, y: newY }
  }, [])

  const countDots = useCallback(() => {
    let count = 0
    for (const row of mazeRef.current) {
      for (const cell of row) {
        if (cell === 2 || cell === 3) count++
      }
    }
    return count
  }, [])

  const moveGhost = useCallback((ghost: Ghost) => {
    // If ghost is in house, move up to exit
    if (ghost.inHouse) {
      if (ghost.y > 9) {
        ghost.y--
      } else if (ghost.x !== 9) {
        ghost.x += ghost.x < 9 ? 1 : -1
      } else {
        ghost.inHouse = false
        ghost.direction = 'left'
      }
      return
    }

    const directions: Direction[] = ['up', 'down', 'left', 'right']
    const opposite: Record<Direction, Direction> = {
      up: 'down', down: 'up', left: 'right', right: 'left'
    }
    
    // Get valid directions (not opposite and not wall)
    const validDirs = directions.filter(d => 
      d !== opposite[ghost.direction] && canMove(ghost.x, ghost.y, d)
    )
    
    if (validDirs.length === 0) {
      // Dead end, go back
      if (canMove(ghost.x, ghost.y, opposite[ghost.direction])) {
        ghost.direction = opposite[ghost.direction]
      }
    } else if (validDirs.length === 1) {
      ghost.direction = validDirs[0]
    } else {
      // Choose direction towards or away from pacman
      const pacman = pacmanRef.current
      let bestDir = validDirs[0]
      let bestDist = ghost.scared ? -Infinity : Infinity
      
      for (const dir of validDirs) {
        const pos = getNewPosition(ghost.x, ghost.y, dir)
        const dist = Math.abs(pos.x - pacman.x) + Math.abs(pos.y - pacman.y)
        
        if (ghost.scared) {
          if (dist > bestDist) {
            bestDist = dist
            bestDir = dir
          }
        } else {
          if (dist < bestDist) {
            bestDist = dist
            bestDir = dir
          }
        }
      }
      
      // Add randomness to make game more playable
      if (Math.random() < 0.3) {
        ghost.direction = validDirs[Math.floor(Math.random() * validDirs.length)]
      } else {
        ghost.direction = bestDir
      }
    }
    
    if (canMove(ghost.x, ghost.y, ghost.direction)) {
      const newPos = getNewPosition(ghost.x, ghost.y, ghost.direction)
      ghost.x = newPos.x
      ghost.y = newPos.y
    }
  }, [canMove, getNewPosition])

  const updateGame = useCallback(() => {
    const pacman = pacmanRef.current
    frameCountRef.current++
    
    // Animate mouth
    if (frameCountRef.current % 5 === 0) {
      pacman.mouthOpen = !pacman.mouthOpen
    }
    
    // Try to change direction
    if (canMove(pacman.x, pacman.y, pacman.nextDirection)) {
      pacman.direction = pacman.nextDirection
    }
    
    // Move pacman (every 8 frames)
    if (frameCountRef.current % 8 === 0) {
      if (canMove(pacman.x, pacman.y, pacman.direction)) {
        const newPos = getNewPosition(pacman.x, pacman.y, pacman.direction)
        pacman.x = newPos.x
        pacman.y = newPos.y
        
        // Eat dot
        const cell = mazeRef.current[pacman.y][pacman.x]
        if (cell === 2) {
          pacmanSounds.waka()
          mazeRef.current[pacman.y][pacman.x] = 4
          setScore(s => s + 10)
        } else if (cell === 3) {
          pacmanSounds.powerPellet()
          mazeRef.current[pacman.y][pacman.x] = 4
          setScore(s => s + 50)
          
          // Power mode
          powerModeRef.current = true
          ghostsRef.current.forEach(g => { g.scared = true; g.eaten = false })
          
          if (powerTimerRef.current) clearTimeout(powerTimerRef.current)
          powerTimerRef.current = setTimeout(() => {
            powerModeRef.current = false
            ghostsRef.current.forEach(g => { g.scared = false })
          }, 8000)
        }
        
        // Check win
        if (countDots() === 0) {
          pacmanSounds.win()
          setGameState('won')
          return
        }
      }
    }
    
    // Move ghosts (every 12-20 frames - slower than pacman)
    const ghostSpeed = powerModeRef.current ? 20 : 12
    if (frameCountRef.current % ghostSpeed === 0) {
      ghostsRef.current.forEach(ghost => {
        if (!ghost.eaten && frameCountRef.current >= ghost.releaseTime) {
          moveGhost(ghost)
        }
      })
    }
    
    // Check ghost collision
    for (const ghost of ghostsRef.current) {
      if (ghost.eaten || ghost.inHouse) continue
      
      // Use pixel distance for more accurate collision
      const dist = Math.abs(ghost.x - pacman.x) + Math.abs(ghost.y - pacman.y)
      if (dist < 1) {
        if (ghost.scared) {
          pacmanSounds.eatGhost()
          ghost.eaten = true
          setScore(s => s + 200)
        } else {
          // Lose life
          pacmanSounds.death()
          setLives(l => {
            if (l <= 1) {
              setGameState('lost')
              return 0
            }
            resetPositions()
            return l - 1
          })
          return
        }
      }
    }
  }, [canMove, getNewPosition, countDots, moveGhost, resetPositions])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    
    const maze = mazeRef.current
    const pacman = pacmanRef.current

    // Clear
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, COLS * CELL_SIZE, ROWS * CELL_SIZE)

    // Draw maze
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const cell = maze[y][x]
        const px = x * CELL_SIZE
        const py = y * CELL_SIZE
        
        if (cell === 1) {
          // Wall
          ctx.fillStyle = '#2121DE'
          ctx.fillRect(px + 2, py + 2, CELL_SIZE - 4, CELL_SIZE - 4)
        } else if (cell === 2) {
          // Dot
          ctx.fillStyle = '#FFB897'
          ctx.beginPath()
          ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, 2, 0, Math.PI * 2)
          ctx.fill()
        } else if (cell === 3) {
          // Power pellet (animate)
          const pulse = Math.sin(frameCountRef.current * 0.1) * 2 + 6
          ctx.fillStyle = '#FFB897'
          ctx.beginPath()
          ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, pulse, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    // Draw ghosts
    for (const ghost of ghostsRef.current) {
      if (ghost.eaten) continue
      
      const gx = ghost.x * CELL_SIZE + CELL_SIZE / 2
      const gy = ghost.y * CELL_SIZE + CELL_SIZE / 2
      
      // Flashing when power mode is ending
      let ghostColor = ghost.color
      if (ghost.scared) {
        ghostColor = '#2121DE'
      }
      ctx.fillStyle = ghostColor
      
      // Ghost body
      ctx.beginPath()
      ctx.arc(gx, gy - 2, 8, Math.PI, 0)
      ctx.lineTo(gx + 8, gy + 6)
      ctx.lineTo(gx + 5, gy + 3)
      ctx.lineTo(gx + 2, gy + 6)
      ctx.lineTo(gx - 1, gy + 3)
      ctx.lineTo(gx - 4, gy + 6)
      ctx.lineTo(gx - 8, gy + 6)
      ctx.closePath()
      ctx.fill()
      
      // Eyes
      if (!ghost.scared) {
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(gx - 3, gy - 3, 3, 0, Math.PI * 2)
        ctx.arc(gx + 3, gy - 3, 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#00f'
        ctx.beginPath()
        ctx.arc(gx - 3, gy - 3, 1.5, 0, Math.PI * 2)
        ctx.arc(gx + 3, gy - 3, 1.5, 0, Math.PI * 2)
        ctx.fill()
      } else {
        // Scared face
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(gx - 3, gy - 2, 2, 0, Math.PI * 2)
        ctx.arc(gx + 3, gy - 2, 2, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Draw Pac-Man
    const px = pacman.x * CELL_SIZE + CELL_SIZE / 2
    const py = pacman.y * CELL_SIZE + CELL_SIZE / 2
    
    ctx.fillStyle = '#FFFF00'
    ctx.beginPath()
    
    let startAngle = 0
    let endAngle = Math.PI * 2
    
    if (pacman.mouthOpen) {
      const mouthAngle = 0.3
      switch (pacman.direction) {
        case 'right':
          startAngle = mouthAngle
          endAngle = Math.PI * 2 - mouthAngle
          break
        case 'left':
          startAngle = Math.PI + mouthAngle
          endAngle = Math.PI - mouthAngle
          break
        case 'up':
          startAngle = -Math.PI / 2 + mouthAngle
          endAngle = -Math.PI / 2 - mouthAngle + Math.PI * 2
          break
        case 'down':
          startAngle = Math.PI / 2 + mouthAngle
          endAngle = Math.PI / 2 - mouthAngle
          break
      }
    }
    
    ctx.arc(px, py, 9, startAngle, endAngle)
    ctx.lineTo(px, py)
    ctx.fill()
  }, [])

  const gameLoop = useCallback(() => {
    if (gameState === 'playing') {
      updateGame()
      draw()
    }
    gameLoopRef.current = requestAnimationFrame(gameLoop)
  }, [gameState, updateGame, draw])

  // Game loop
  useEffect(() => {
    if (gameState === 'playing') {
      gameLoopRef.current = requestAnimationFrame(gameLoop)
    }
    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current)
    }
  }, [gameState, gameLoop])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState !== 'playing') return
      
      const pacman = pacmanRef.current
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          pacman.nextDirection = 'up'
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          pacman.nextDirection = 'down'
          break
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          pacman.nextDirection = 'left'
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          pacman.nextDirection = 'right'
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [gameState])

  const startGame = () => {
    resumeAudio()
    pacmanSounds.start()
    initMaze()
    initGhosts()
    pacmanRef.current = { x: 9, y: 15, direction: 'left', nextDirection: 'left', mouthOpen: true }
    powerModeRef.current = false
    frameCountRef.current = 0
    setScore(0)
    setLives(3)
    setLevel(1)
    setGameState('playing')
  }

  // Initial draw
  useEffect(() => {
    initMaze()
    initGhosts()
    draw()
  }, [initMaze, initGhosts, draw])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-950 to-gray-900 pb-8 px-4 pt-[10px] sm:pt-[50px]">
      <div className="max-w-xl mx-auto">
        {/* Stats - Mobile: Inline */}
        <div className="sm:hidden flex justify-center gap-3 mb-2.5">
          <div className="bg-gray-800/50 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <span className="text-gray-400 text-xs">SCORE</span>
            <span className="text-white font-bold">{score.toLocaleString()}</span>
          </div>
          <div className="bg-gray-800/50 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <span className="text-gray-400 text-xs">HIGH</span>
            <span className="text-yellow-400 font-bold">{highScore.toLocaleString()}</span>
          </div>
          <div className="bg-gray-800/50 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <span className="text-gray-400 text-xs">LIVES</span>
            <span className="text-yellow-400 font-bold">{'🟡'.repeat(lives)}</span>
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
            <div className="text-yellow-400 font-bold">{'🟡'.repeat(lives)}</div>
          </div>
        </div>

        {/* Game Canvas */}
        <div className="relative flex justify-center">
          <canvas
            ref={canvasRef}
            width={COLS * CELL_SIZE}
            height={ROWS * CELL_SIZE}
            className="rounded-xl border-4 border-blue-600/30"
          />

          {/* Overlays - on top of game canvas */}
          {gameState === 'start' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3">
              <div className="text-4xl">🟡</div>
              <div className="text-xl font-bold text-yellow-400">PAC-MAN</div>
              <div className="text-gray-300 text-xs text-center px-6">
                Arrow keys / WASD to move.<br />
                Eat dots, avoid ghosts!
              </div>
              <button
                onClick={startGame}
                className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 rounded-lg font-bold text-black transition-colors mt-2"
              >
                START
              </button>
            </div>
          )}

          {gameState === 'won' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3">
              <div className="text-4xl">🎉</div>
              <div className="text-xl font-bold text-green-400">YOU WIN!</div>
              <div className="text-gray-300 text-sm">
                Score: <span className="text-yellow-400 font-bold">{score.toLocaleString()}</span>
              </div>
              <button
                onClick={startGame}
                className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 rounded-lg font-bold text-black transition-colors"
              >
                PLAY AGAIN
              </button>
            </div>
          )}

          {gameState === 'lost' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3">
              <div className="text-4xl">👻</div>
              <div className="text-xl font-bold text-red-400">GAME OVER</div>
              <div className="text-gray-300 text-sm">
                Score: <span className="text-yellow-400 font-bold">{score.toLocaleString()}</span>
              </div>
              <button
                onClick={startGame}
                className="px-6 py-2 bg-yellow-500 hover:bg-yellow-400 rounded-lg font-bold text-black transition-colors"
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
              onTouchStart={() => { pacmanRef.current.nextDirection = 'left' }}
              className="w-14 h-14 bg-violet-600/80 rounded-xl active:bg-violet-500 flex items-center justify-center text-white font-bold text-xl"
            >
              ←
            </button>
            <button
              onTouchStart={() => { pacmanRef.current.nextDirection = 'up' }}
              className="w-14 h-14 bg-violet-600/80 rounded-xl active:bg-violet-500 flex items-center justify-center text-white font-bold text-xl"
            >
              ↑
            </button>
            <button
              onTouchStart={() => { pacmanRef.current.nextDirection = 'down' }}
              className="w-14 h-14 bg-violet-600/80 rounded-xl active:bg-violet-500 flex items-center justify-center text-white font-bold text-xl"
            >
              ↓
            </button>
            <button
              onTouchStart={() => { pacmanRef.current.nextDirection = 'right' }}
              className="w-14 h-14 bg-violet-600/80 rounded-xl active:bg-violet-500 flex items-center justify-center text-white font-bold text-xl"
            >
              →
            </button>
          </div>
        </div>

        {/* Controls Info - Desktop only */}
        <div className="hidden sm:block mt-4 text-center text-gray-500 text-sm">
          <p>Arrow keys / WASD to move • Eat all dots • Power pellets let you eat ghosts!</p>
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
