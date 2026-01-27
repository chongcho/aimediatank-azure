'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { resumeAudio } from '@/lib/gameSound'

const GAME_WIDTH = 480
const GAME_HEIGHT = 640
const PADDLE_WIDTH = 100
const PADDLE_HEIGHT = 15
const PADDLE_SPEED = 8
const BALL_SIZE = 12
const BALL_SPEED = 5
const BRICK_ROWS = 6
const BRICK_COLS = 10
const BRICK_WIDTH = 44
const BRICK_HEIGHT = 20
const BRICK_GAP = 4
const BRICK_OFFSET_TOP = 60
const BRICK_OFFSET_LEFT = 10
const MOUSE_SENSITIVITY = 1.5
const CONTROL_AREA_HEIGHT = 50

// Brick colors by row
const BRICK_COLORS = [
  '#FF6B6B', // Red
  '#FF9F43', // Orange
  '#FECA57', // Yellow
  '#48DBFB', // Cyan
  '#1DD1A1', // Green
  '#5F27CD', // Purple
]

interface Brick {
  x: number
  y: number
  width: number
  height: number
  color: string
  visible: boolean
  points: number
}

interface Ball {
  x: number
  y: number
  dx: number
  dy: number
}

interface Paddle {
  x: number
  y: number
  width: number
  height: number
}

// Sound effects using Web Audio API
const playSound = (frequency: number, duration: number, type: OscillatorType = 'square', volume: number = 0.2) => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    const oscillator = audioContext.createOscillator()
    const gainNode = audioContext.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(audioContext.destination)
    oscillator.type = type
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime)
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration)
    oscillator.start(audioContext.currentTime)
    oscillator.stop(audioContext.currentTime + duration)
  } catch (e) {
    // Audio not supported
  }
}

const sounds = {
  paddle: () => playSound(300, 0.05),
  brick: () => playSound(500, 0.08),
  wall: () => playSound(200, 0.05),
  lose: () => {
    playSound(200, 0.15)
    setTimeout(() => playSound(150, 0.15), 150)
    setTimeout(() => playSound(100, 0.3), 300)
  },
  win: () => {
    playSound(523, 0.1)
    setTimeout(() => playSound(659, 0.1), 100)
    setTimeout(() => playSound(784, 0.1), 200)
    setTimeout(() => playSound(1047, 0.3), 300)
  },
  levelUp: () => {
    playSound(440, 0.1)
    setTimeout(() => playSound(550, 0.1), 100)
    setTimeout(() => playSound(660, 0.2), 200)
  },
}

export default function BreakoutPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'start' | 'playing' | 'paused' | 'won' | 'lost'>('start')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [level, setLevel] = useState(1)
  const [highScore, setHighScore] = useState(0)
  const [isPointerLocked, setIsPointerLocked] = useState(false)
  
  const paddleRef = useRef<Paddle>({
    x: GAME_WIDTH / 2 - PADDLE_WIDTH / 2,
    y: GAME_HEIGHT - CONTROL_AREA_HEIGHT - PADDLE_HEIGHT - 10,
    width: PADDLE_WIDTH,
    height: PADDLE_HEIGHT,
  })
  
  const ballRef = useRef<Ball>({
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT - 60,
    dx: BALL_SPEED,
    dy: -BALL_SPEED,
  })
  
  const bricksRef = useRef<Brick[]>([])
  const keysRef = useRef<Set<string>>(new Set())
  const gameLoopRef = useRef<number | null>(null)
  const gameStateRef = useRef(gameState)

  // Keep gameStateRef in sync
  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  // Load high score
  useEffect(() => {
    const saved = localStorage.getItem('breakout-highscore')
    if (saved) setHighScore(parseInt(saved))
  }, [])

  // Save high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score)
      localStorage.setItem('breakout-highscore', score.toString())
    }
  }, [score, highScore])

  // Request pointer lock
  const requestPointerLock = useCallback(() => {
    const canvas = canvasRef.current
    if (canvas && document.pointerLockElement !== canvas) {
      canvas.requestPointerLock()
    }
  }, [])

  // Exit pointer lock
  const exitPointerLock = useCallback(() => {
    if (document.pointerLockElement) {
      document.exitPointerLock()
    }
  }, [])

  // Handle pointer lock change
  useEffect(() => {
    const handlePointerLockChange = () => {
      const canvas = canvasRef.current
      setIsPointerLocked(document.pointerLockElement === canvas)
      
      // If pointer lock was lost while playing, pause the game
      if (document.pointerLockElement !== canvas && gameStateRef.current === 'playing') {
        setGameState('paused')
      }
    }

    document.addEventListener('pointerlockchange', handlePointerLockChange)
    return () => {
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
    }
  }, [])

  // Release pointer lock when game ends or pauses
  useEffect(() => {
    if (gameState !== 'playing') {
      exitPointerLock()
    }
  }, [gameState, exitPointerLock])

  const createBricks = useCallback((lvl: number) => {
    const bricks: Brick[] = []
    const rows = Math.min(BRICK_ROWS + Math.floor((lvl - 1) / 2), 8)
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        bricks.push({
          x: BRICK_OFFSET_LEFT + col * (BRICK_WIDTH + BRICK_GAP),
          y: BRICK_OFFSET_TOP + row * (BRICK_HEIGHT + BRICK_GAP),
          width: BRICK_WIDTH,
          height: BRICK_HEIGHT,
          color: BRICK_COLORS[row % BRICK_COLORS.length],
          visible: true,
          points: (rows - row) * 10, // Higher rows = more points
        })
      }
    }
    return bricks
  }, [])

  const resetBall = useCallback(() => {
    const paddle = paddleRef.current
    ballRef.current = {
      x: paddle.x + paddle.width / 2,
      y: paddle.y - BALL_SIZE - 5,
      dx: (Math.random() > 0.5 ? 1 : -1) * BALL_SPEED,
      dy: -BALL_SPEED,
    }
  }, [])

  const resetGame = useCallback((lvl: number = 1) => {
    paddleRef.current = {
      x: GAME_WIDTH / 2 - PADDLE_WIDTH / 2,
      y: GAME_HEIGHT - CONTROL_AREA_HEIGHT - PADDLE_HEIGHT - 10,
      width: PADDLE_WIDTH,
      height: PADDLE_HEIGHT,
    }
    bricksRef.current = createBricks(lvl)
    resetBall()
  }, [createBricks, resetBall])

  const updateGame = useCallback(() => {
    const paddle = paddleRef.current
    const ball = ballRef.current
    const keys = keysRef.current

    // Move paddle
    if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) {
      paddle.x = Math.max(0, paddle.x - PADDLE_SPEED)
    }
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) {
      paddle.x = Math.min(GAME_WIDTH - paddle.width, paddle.x + PADDLE_SPEED)
    }

    // Move ball
    ball.x += ball.dx
    ball.y += ball.dy

    // Wall collision
    if (ball.x <= 0 || ball.x >= GAME_WIDTH - BALL_SIZE) {
      ball.dx = -ball.dx
      ball.x = ball.x <= 0 ? 0 : GAME_WIDTH - BALL_SIZE
      sounds.wall()
    }
    if (ball.y <= 0) {
      ball.dy = -ball.dy
      ball.y = 0
      sounds.wall()
    }

    // Paddle collision
    if (
      ball.y + BALL_SIZE >= paddle.y &&
      ball.y + BALL_SIZE <= paddle.y + paddle.height + 10 &&
      ball.x + BALL_SIZE >= paddle.x &&
      ball.x <= paddle.x + paddle.width &&
      ball.dy > 0
    ) {
      // Calculate bounce angle based on where ball hits paddle
      const hitPos = (ball.x + BALL_SIZE / 2 - paddle.x) / paddle.width
      const angle = (hitPos - 0.5) * Math.PI * 0.7 // -63 to 63 degrees
      const speed = Math.sqrt(ball.dx * ball.dx + ball.dy * ball.dy) * 1.02 // Slight speed increase
      const maxSpeed = BALL_SPEED * 2
      
      ball.dx = Math.sin(angle) * Math.min(speed, maxSpeed)
      ball.dy = -Math.cos(angle) * Math.min(speed, maxSpeed)
      ball.y = paddle.y - BALL_SIZE
      sounds.paddle()
    }

    // Ball fell below paddle
    if (ball.y > GAME_HEIGHT) {
      sounds.lose()
      setLives(l => {
        if (l <= 1) {
          setGameState('lost')
          return 0
        }
        resetBall()
        return l - 1
      })
      return
    }

    // Brick collision
    for (const brick of bricksRef.current) {
      if (!brick.visible) continue
      
      if (
        ball.x + BALL_SIZE > brick.x &&
        ball.x < brick.x + brick.width &&
        ball.y + BALL_SIZE > brick.y &&
        ball.y < brick.y + brick.height
      ) {
        brick.visible = false
        setScore(s => s + brick.points)
        sounds.brick()
        
        // Determine collision side
        const overlapLeft = ball.x + BALL_SIZE - brick.x
        const overlapRight = brick.x + brick.width - ball.x
        const overlapTop = ball.y + BALL_SIZE - brick.y
        const overlapBottom = brick.y + brick.height - ball.y
        
        const minOverlapX = Math.min(overlapLeft, overlapRight)
        const minOverlapY = Math.min(overlapTop, overlapBottom)
        
        if (minOverlapX < minOverlapY) {
          ball.dx = -ball.dx
        } else {
          ball.dy = -ball.dy
        }
        
        break // Only hit one brick per frame
      }
    }

    // Check if all bricks destroyed
    const remainingBricks = bricksRef.current.filter(b => b.visible).length
    if (remainingBricks === 0) {
      sounds.levelUp()
      setLevel(l => {
        const newLevel = l + 1
        if (newLevel > 10) {
          sounds.win()
          setGameState('won')
          return l
        }
        resetGame(newLevel)
        return newLevel
      })
    }
  }, [resetBall, resetGame])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const paddle = paddleRef.current
    const ball = ballRef.current

    // Clear
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Draw bricks
    for (const brick of bricksRef.current) {
      if (!brick.visible) continue
      
      // Brick body
      ctx.fillStyle = brick.color
      ctx.fillRect(brick.x, brick.y, brick.width, brick.height)
      
      // Brick highlight
      ctx.fillStyle = 'rgba(255,255,255,0.3)'
      ctx.fillRect(brick.x, brick.y, brick.width, 4)
      
      // Brick shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)'
      ctx.fillRect(brick.x, brick.y + brick.height - 4, brick.width, 4)
    }

    // Draw paddle - T-shaped with handle
    const gradient = ctx.createLinearGradient(paddle.x, paddle.y, paddle.x, paddle.y + paddle.height)
    gradient.addColorStop(0, '#4ECDC4')
    gradient.addColorStop(1, '#2ECC71')
    ctx.fillStyle = gradient
    // Paddle head
    ctx.beginPath()
    ctx.roundRect(paddle.x, paddle.y, paddle.width, paddle.height, 5)
    ctx.fill()
    // Paddle stem/handle extending down
    const stemWidth = 8
    const stemX = paddle.x + paddle.width / 2 - stemWidth / 2
    ctx.fillRect(stemX, paddle.y + paddle.height, stemWidth, CONTROL_AREA_HEIGHT - 20)
    
    // Draw hand icon at bottom of stem
    const handY = GAME_HEIGHT - 18
    const handX = paddle.x + paddle.width / 2
    ctx.strokeStyle = '#4ECDC4'
    ctx.lineWidth = 2
    // Finger pointing up
    ctx.beginPath()
    ctx.moveTo(handX, handY)
    ctx.lineTo(handX, handY - 12)
    ctx.stroke()
    // Hand circle
    ctx.beginPath()
    ctx.arc(handX, handY + 6, 8, 0, Math.PI * 2)
    ctx.stroke()

    // Draw ball
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(ball.x + BALL_SIZE / 2, ball.y + BALL_SIZE / 2, BALL_SIZE / 2, 0, Math.PI * 2)
    ctx.fill()
    
    // Ball glow
    ctx.shadowColor = '#fff'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(ball.x + BALL_SIZE / 2, ball.y + BALL_SIZE / 2, BALL_SIZE / 2 - 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Draw control area background
    ctx.fillStyle = '#0a0a12'
    ctx.fillRect(0, GAME_HEIGHT - CONTROL_AREA_HEIGHT, GAME_WIDTH, CONTROL_AREA_HEIGHT)
    // Separator line
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(0, GAME_HEIGHT - CONTROL_AREA_HEIGHT)
    ctx.lineTo(GAME_WIDTH, GAME_HEIGHT - CONTROL_AREA_HEIGHT)
    ctx.stroke()
    ctx.setLineDash([])
  }, [isPointerLocked])

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
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D', ' ', 'p', 'P', 'Escape'].includes(e.key)) {
        e.preventDefault()
        keysRef.current.add(e.key)
        
        if ((e.key === 'p' || e.key === 'P') && gameState === 'playing') {
          setGameState('paused')
        } else if ((e.key === 'p' || e.key === 'P') && gameState === 'paused') {
          setGameState('playing')
          requestPointerLock()
        }
        // Note: Escape will automatically exit pointer lock, which triggers pause
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
  }, [gameState, requestPointerLock])

  // Mouse movement with pointer lock
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleMouseMove = (e: MouseEvent) => {
      if (gameStateRef.current !== 'playing') return
      
      const paddle = paddleRef.current
      
      // Use movementX for pointer-locked control (relative movement)
      if (document.pointerLockElement === canvas) {
        const movement = e.movementX * MOUSE_SENSITIVITY
        paddle.x = Math.max(0, Math.min(GAME_WIDTH - paddle.width, paddle.x + movement))
      } else {
        // Fallback: absolute position when not locked
        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const scaledX = (x / rect.width) * GAME_WIDTH
        paddle.x = Math.max(0, Math.min(GAME_WIDTH - paddle.width, scaledX - paddle.width / 2))
      }
    }

    // Click to lock pointer during gameplay
    const handleClick = () => {
      if (gameStateRef.current === 'playing' && document.pointerLockElement !== canvas) {
        requestPointerLock()
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('click', handleClick)
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('click', handleClick)
    }
  }, [requestPointerLock])

  // Touch controls (no pointer lock for touch)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleTouchMove = (e: TouchEvent) => {
      if (gameStateRef.current !== 'playing') return
      if (e.touches.length > 0) {
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const x = e.touches[0].clientX - rect.left
        const scaledX = (x / rect.width) * GAME_WIDTH
        paddleRef.current.x = Math.max(0, Math.min(GAME_WIDTH - PADDLE_WIDTH, scaledX - PADDLE_WIDTH / 2))
      }
    }

    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    
    return () => {
      canvas.removeEventListener('touchmove', handleTouchMove)
    }
  }, [])

  const startGame = () => {
    resumeAudio()
    setScore(0)
    setLives(3)
    setLevel(1)
    resetGame(1)
    setGameState('playing')
    // Request pointer lock after a short delay
    setTimeout(() => {
      requestPointerLock()
    }, 100)
  }

  const resumeGame = () => {
    setGameState('playing')
    requestPointerLock()
  }

  // Initial draw
  useEffect(() => {
    resetGame(1)
    draw()
  }, [resetGame, draw])

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-indigo-950 to-gray-900 pb-8 px-2 sm:px-4 pt-[15px] sm:pt-[50px]">
      <div className="max-w-xl mx-auto">
        {/* Stats - Compact for mobile */}
        <div className="flex justify-center gap-2 sm:gap-4 mb-3">
          <div className="bg-gray-800/50 px-2 sm:px-4 py-1 sm:py-2 rounded-lg flex sm:block items-center gap-1">
            <span className="text-gray-400 text-[10px] sm:text-xs">SCORE</span>
            <div className="text-white font-bold text-sm sm:text-base">{score.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/50 px-2 sm:px-4 py-1 sm:py-2 rounded-lg flex sm:block items-center gap-1">
            <span className="text-gray-400 text-[10px] sm:text-xs">HIGH</span>
            <div className="text-yellow-400 font-bold text-sm sm:text-base">{highScore.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800/50 px-2 sm:px-4 py-1 sm:py-2 rounded-lg flex sm:block items-center gap-1">
            <span className="text-gray-400 text-[10px] sm:text-xs">LIVES</span>
            <div className="text-red-400 font-bold text-sm sm:text-base">{'❤️'.repeat(lives)}</div>
          </div>
          <div className="bg-gray-800/50 px-2 sm:px-4 py-1 sm:py-2 rounded-lg flex sm:block items-center gap-1">
            <span className="text-gray-400 text-[10px] sm:text-xs">LVL</span>
            <div className="text-cyan-400 font-bold text-sm sm:text-base">{level}</div>
          </div>
        </div>

        {/* Game Canvas - Responsive */}
        <div className="relative flex justify-center">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="rounded-xl border-2 sm:border-4 border-cyan-600/30 cursor-none w-full max-w-[480px]"
            style={{ aspectRatio: `${GAME_WIDTH} / ${GAME_HEIGHT}` }}
          />

          {/* Overlays - on top of game canvas */}
          {gameState === 'start' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3">
              <div className="text-4xl">🧱</div>
              <div className="text-xl font-bold text-cyan-400">BLOCK BREAKER</div>
              <div className="text-gray-300 text-xs text-center px-6">
                Move paddle with mouse.<br />
                Break all blocks to advance!
              </div>
              <button
                onClick={startGame}
                className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 rounded-lg font-bold text-white transition-colors mt-2"
              >
                START
              </button>
            </div>
          )}

          {gameState === 'paused' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3">
              <div className="text-2xl font-bold text-white">PAUSED</div>
              <button
                onClick={resumeGame}
                className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-500 rounded-lg font-bold text-white"
              >
                RESUME
              </button>
            </div>
          )}

          {gameState === 'won' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3">
              <div className="text-4xl">🏆</div>
              <div className="text-xl font-bold text-yellow-400">YOU WIN!</div>
              <div className="text-gray-300 text-sm">
                Score: <span className="text-yellow-400 font-bold">{score.toLocaleString()}</span>
              </div>
              <button
                onClick={startGame}
                className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-500 rounded-lg font-bold text-white"
              >
                PLAY AGAIN
              </button>
            </div>
          )}

          {gameState === 'lost' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-3">
              <div className="text-4xl">💔</div>
              <div className="text-xl font-bold text-red-400">GAME OVER</div>
              <div className="text-gray-300 text-sm">
                Score: <span className="text-yellow-400 font-bold">{score.toLocaleString()}</span>
              </div>
              <button
                onClick={startGame}
                className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-teal-500 rounded-lg font-bold text-white"
              >
                PLAY AGAIN
              </button>
            </div>
          )}
        </div>

        {/* Controls Info - Desktop only */}
        <div className="hidden sm:block mt-4 text-center text-gray-500 text-sm">
          <p>Mouse to move paddle • ←→ / A D keys • P to pause • Break all blocks to win!</p>
        </div>
      </div>
    </div>
  )
}
