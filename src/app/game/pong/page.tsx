'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { resumeAudio } from '@/lib/gameSound'

const GAME_WIDTH = 400
const GAME_HEIGHT = 500
const PADDLE_WIDTH = 84
const PADDLE_HEIGHT = 12
const PADDLE_SPEED = 13
const BALL_SIZE = 12
const INITIAL_BALL_SPEED = 7
const MAX_BALL_SPEED = 15
const CONTROL_AREA_HEIGHT = 50
const MOUSE_SENSITIVITY = 1.5

// Retro sound effects
const playSound = (frequency: number, duration: number, type: OscillatorType = 'square', volume: number = 0.15) => {
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
  paddle: () => playSound(440, 0.05),
  wall: () => playSound(330, 0.05),
  point: () => playSound(660, 0.08),
  lose: () => {
    playSound(200, 0.15)
    setTimeout(() => playSound(150, 0.15), 150)
    setTimeout(() => playSound(100, 0.3), 300)
  },
  levelUp: () => {
    playSound(523, 0.1)
    setTimeout(() => playSound(659, 0.1), 100)
    setTimeout(() => playSound(784, 0.2), 200)
  },
}

interface Ball {
  x: number
  y: number
  dx: number
  dy: number
  speed: number
}

export default function PongPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'start' | 'playing' | 'paused' | 'lost'>('start')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [isPointerLocked, setIsPointerLocked] = useState(false)
  
  const paddleXRef = useRef(GAME_WIDTH / 2 - PADDLE_WIDTH / 2)
  const ballRef = useRef<Ball>({
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    dx: (Math.random() - 0.5) * 4,
    dy: INITIAL_BALL_SPEED,
    speed: INITIAL_BALL_SPEED,
  })
  
  const keysRef = useRef<Set<string>>(new Set())
  const gameLoopRef = useRef<number | null>(null)
  const rallyCountRef = useRef(0)
  const gameStateRef = useRef(gameState)

  // Keep gameStateRef in sync
  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

  // Paddle Y position (above control area)
  const PADDLE_Y = GAME_HEIGHT - CONTROL_AREA_HEIGHT - PADDLE_HEIGHT - 10

  // Load high score
  useEffect(() => {
    const saved = localStorage.getItem('pong-solo-highscore')
    if (saved) setHighScore(parseInt(saved))
  }, [])

  // Save high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score)
      localStorage.setItem('pong-solo-highscore', score.toString())
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

  const resetBall = useCallback(() => {
    const angle = (Math.random() - 0.5) * Math.PI / 4 // -22.5 to 22.5 degrees
    ballRef.current = {
      x: paddleXRef.current + PADDLE_WIDTH / 2 - BALL_SIZE / 2,
      y: PADDLE_Y - BALL_SIZE - 5,
      dx: Math.sin(angle) * INITIAL_BALL_SPEED,
      dy: -INITIAL_BALL_SPEED, // Go up toward the wall
      speed: INITIAL_BALL_SPEED,
    }
    rallyCountRef.current = 0
  }, [PADDLE_Y])

  const updateGame = useCallback(() => {
    const paddleX = paddleXRef.current
    const ball = ballRef.current
    const keys = keysRef.current

    // Move paddle with keyboard
    if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) {
      paddleXRef.current = Math.max(0, paddleX - PADDLE_SPEED)
    }
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) {
      paddleXRef.current = Math.min(GAME_WIDTH - PADDLE_WIDTH, paddleX + PADDLE_SPEED)
    }

    // Move ball
    ball.x += ball.dx
    ball.y += ball.dy

    // Wall collision (left/right)
    if (ball.x <= 0 || ball.x >= GAME_WIDTH - BALL_SIZE) {
      ball.dx = -ball.dx
      ball.x = ball.x <= 0 ? 0 : GAME_WIDTH - BALL_SIZE
      sounds.wall()
    }

    // Top wall collision (target wall - bounce back and score)
    if (ball.y <= 0) {
      ball.dy = Math.abs(ball.dy) // Always bounce down
      ball.y = 0
      sounds.wall()
      
      // Score point for reaching the wall
      rallyCountRef.current++
      sounds.point()
      setScore(s => s + 10 * level)
      
      // Level up every 10 bounces
      if (rallyCountRef.current % 10 === 0) {
        sounds.levelUp()
        setLevel(l => l + 1)
        // Increase speed by 10% each level
        ball.speed = Math.min(MAX_BALL_SPEED, ball.speed * 1.1)
      }
    }

    // Player paddle collision
    if (
      ball.y + BALL_SIZE >= PADDLE_Y &&
      ball.y + BALL_SIZE <= PADDLE_Y + PADDLE_HEIGHT + 10 &&
      ball.x + BALL_SIZE >= paddleXRef.current &&
      ball.x <= paddleXRef.current + PADDLE_WIDTH &&
      ball.dy > 0
    ) {
      // Calculate bounce angle based on where ball hits paddle
      const hitPos = (ball.x + BALL_SIZE / 2 - paddleXRef.current) / PADDLE_WIDTH
      const angle = (hitPos - 0.5) * Math.PI * 0.6 // -54 to 54 degrees
      
      ball.dx = Math.sin(angle) * ball.speed
      ball.dy = -Math.cos(angle) * ball.speed
      ball.y = PADDLE_Y - BALL_SIZE - 1
      sounds.paddle()
    }

    // Ball passed paddle - Game Over (check against control area top)
    if (ball.y > GAME_HEIGHT - CONTROL_AREA_HEIGHT) {
      sounds.lose()
      setGameState('lost')
    }
  }, [level, PADDLE_Y])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const paddleX = paddleXRef.current
    const ball = ballRef.current

    // Clear with dark blue background
    ctx.fillStyle = '#0a1628'
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)

    // Draw control area (darker zone at bottom)
    ctx.fillStyle = '#061018'
    ctx.fillRect(0, GAME_HEIGHT - CONTROL_AREA_HEIGHT, GAME_WIDTH, CONTROL_AREA_HEIGHT)
    
    // Draw control area separator line
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    ctx.moveTo(0, GAME_HEIGHT - CONTROL_AREA_HEIGHT)
    ctx.lineTo(GAME_WIDTH, GAME_HEIGHT - CONTROL_AREA_HEIGHT)
    ctx.stroke()
    ctx.setLineDash([])


    // Draw score in center (retro style)
    ctx.fillStyle = '#222'
    ctx.font = 'bold 100px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(score.toString(), GAME_WIDTH / 2, (GAME_HEIGHT - CONTROL_AREA_HEIGHT) / 2)

    // Draw level indicator
    ctx.fillStyle = '#333'
    ctx.font = 'bold 14px monospace'
    ctx.fillText(`LEVEL ${level}`, GAME_WIDTH / 2, (GAME_HEIGHT - CONTROL_AREA_HEIGHT) / 2 + 60)

    // Draw top wall (target wall with glow)
    ctx.fillStyle = '#22c55e'
    ctx.shadowColor = '#22c55e'
    ctx.shadowBlur = 10
    ctx.fillRect(0, 0, GAME_WIDTH, 8)
    ctx.shadowBlur = 0

    // Draw player paddle (cyan) - T-shaped with handle
    ctx.fillStyle = '#06b6d4'
    ctx.shadowColor = '#06b6d4'
    ctx.shadowBlur = 15
    // Paddle head
    ctx.fillRect(paddleX, PADDLE_Y, PADDLE_WIDTH, PADDLE_HEIGHT)
    // Paddle stem/handle extending down
    const stemWidth = 8
    const stemX = paddleX + PADDLE_WIDTH / 2 - stemWidth / 2
    ctx.fillRect(stemX, PADDLE_Y + PADDLE_HEIGHT, stemWidth, CONTROL_AREA_HEIGHT - 15)
    ctx.shadowBlur = 0
    
    // Draw hand icon at bottom of stem
    const handY = GAME_HEIGHT - 30
    const handX = paddleX + PADDLE_WIDTH / 2
    ctx.strokeStyle = '#06b6d4'
    ctx.lineWidth = 2
    ctx.beginPath()
    // Simple hand/finger pointing up
    ctx.moveTo(handX, handY)
    ctx.lineTo(handX, handY - 15)
    ctx.moveTo(handX - 6, handY)
    ctx.arc(handX, handY, 6, Math.PI, 0, false)
    ctx.stroke()
    // Hand circle
    ctx.beginPath()
    ctx.arc(handX, handY + 8, 10, 0, Math.PI * 2)
    ctx.stroke()

    // Draw ball (white with glow)
    ctx.fillStyle = '#fff'
    ctx.shadowColor = '#fff'
    ctx.shadowBlur = 20
    ctx.beginPath()
    ctx.arc(ball.x + BALL_SIZE / 2, ball.y + BALL_SIZE / 2, BALL_SIZE / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Draw border
    ctx.strokeStyle = '#333'
    ctx.lineWidth = 4
    ctx.strokeRect(2, 2, GAME_WIDTH - 4, GAME_HEIGHT - 4)

    // Draw rally counter
    ctx.fillStyle = '#444'
    ctx.font = '12px monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`Rally: ${rallyCountRef.current}`, 15, 30)
  }, [score, level, PADDLE_Y, isPointerLocked])

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
      
      // Use movementX for pointer-locked control (relative movement)
      if (document.pointerLockElement === canvas) {
        const movement = e.movementX * MOUSE_SENSITIVITY
        paddleXRef.current = Math.max(0, Math.min(GAME_WIDTH - PADDLE_WIDTH, paddleXRef.current + movement))
      } else {
        // Fallback: absolute position when not locked
        const rect = canvas.getBoundingClientRect()
        const x = e.clientX - rect.left
        const scaledX = (x / rect.width) * GAME_WIDTH
        paddleXRef.current = Math.max(0, Math.min(GAME_WIDTH - PADDLE_WIDTH, scaledX - PADDLE_WIDTH / 2))
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

  // Touch controls on canvas (for mobile - no pointer lock)
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
        paddleXRef.current = Math.max(0, Math.min(GAME_WIDTH - PADDLE_WIDTH, scaledX - PADDLE_WIDTH / 2))
      }
    }

    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchstart', handleTouchMove, { passive: false })
    
    return () => {
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchstart', handleTouchMove)
    }
  }, [])

  const startGame = () => {
    resumeAudio()
    setScore(0)
    setLevel(1)
    paddleXRef.current = GAME_WIDTH / 2 - PADDLE_WIDTH / 2
    resetBall()
    setGameState('playing')
    // Request pointer lock after a short delay to ensure game state is set
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
    draw()
  }, [draw])

  return (
    <div className="min-h-screen bg-black pb-8 px-4 pt-[15px] sm:pt-[50px]">
      <div className="max-w-md mx-auto">
        {/* Stats - Inline layout */}
        <div className="flex justify-center gap-3 mb-4">
          <div className="bg-gray-900 px-3 py-1.5 rounded-lg border border-cyan-500/30 flex items-center gap-2">
            <span className="text-cyan-400 text-xs">SCORE</span>
            <span className="text-cyan-400 font-bold text-lg" style={{ fontFamily: 'monospace' }}>{score}</span>
          </div>
          <div className="bg-gray-900 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <span className="text-gray-400 text-xs">HIGH</span>
            <span className="text-yellow-400 font-bold text-lg" style={{ fontFamily: 'monospace' }}>{highScore}</span>
          </div>
          <div className="bg-gray-900 px-3 py-1.5 rounded-lg border border-green-500/30 flex items-center gap-2">
            <span className="text-green-400 text-xs">LEVEL</span>
            <span className="text-green-400 font-bold text-lg" style={{ fontFamily: 'monospace' }}>{level}</span>
          </div>
        </div>

        {/* Game Canvas */}
        <div className="relative flex flex-col items-center">
          <canvas
            ref={canvasRef}
            width={GAME_WIDTH}
            height={GAME_HEIGHT}
            className="rounded-lg max-w-full cursor-none"
            style={{ imageRendering: 'pixelated' }}
          />

          {/* Overlays - on top of game canvas */}
          {gameState === 'start' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center gap-3">
              <div className="text-4xl font-black text-white tracking-widest" style={{ fontFamily: 'monospace' }}>
                PONG
              </div>
              <div className="text-gray-300 text-xs text-center px-6">
                Move paddle to keep ball in play.<br />
                Hit the green wall to score!
              </div>
              <button
                onClick={startGame}
                className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg font-bold text-black transition-colors mt-2"
                style={{ fontFamily: 'monospace' }}
              >
                START
              </button>
            </div>
          )}

          {gameState === 'paused' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center gap-3">
              <div className="text-2xl font-bold text-white" style={{ fontFamily: 'monospace' }}>PAUSED</div>
              <button
                onClick={resumeGame}
                className="px-6 py-2 bg-white rounded-lg font-bold text-black"
                style={{ fontFamily: 'monospace' }}
              >
                RESUME
              </button>
            </div>
          )}

          {gameState === 'lost' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center gap-3">
              <div className="text-3xl">💥</div>
              <div className="text-2xl font-bold text-red-400" style={{ fontFamily: 'monospace' }}>GAME OVER</div>
              <div className="text-gray-300 text-center text-sm">
                Score: <span className="text-cyan-400 font-bold">{score}</span>
              </div>
              {score >= highScore && score > 0 && (
                <div className="text-yellow-400 font-bold text-sm animate-pulse">🏆 NEW HIGH SCORE!</div>
              )}
              <button
                onClick={startGame}
                className="px-6 py-2 bg-cyan-500 hover:bg-cyan-400 rounded-lg font-bold text-black transition-colors"
                style={{ fontFamily: 'monospace' }}
              >
                PLAY AGAIN
              </button>
            </div>
          )}
        </div>

        {/* Controls Info - Desktop only */}
        <div className="hidden sm:block mt-4 text-center text-gray-500 text-sm">
          <p>Mouse to move paddle • ←→ / A D keys • P to pause • Hit the green wall to score!</p>
        </div>

      </div>
    </div>
  )
}
