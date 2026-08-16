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
const HANDLE_LENGTH = 34
// Racquet can advance almost to the front scoring wall.
const PADDLE_MAX_Y = GAME_HEIGHT - CONTROL_AREA_HEIGHT - PADDLE_HEIGHT - 10
const PADDLE_MIN_Y = 20

const clampPaddleX = (x: number) => Math.max(0, Math.min(GAME_WIDTH - PADDLE_WIDTH, x))
const clampPaddleY = (y: number) => Math.max(PADDLE_MIN_Y, Math.min(PADDLE_MAX_Y, y))
/** Ball speed gained per pixel of forward racquet swing on contact. */
const SWING_SPEED_GAIN = 0.4
/** Cap how much one hit can add from racquet swing (keeps mouse flicks fair). */
const MAX_SWING_BOOST = 6
/** Soften the ball a bit if you hit while pulling back. */
const BACKSWING_SPEED_LOSS = 0.25
const MIN_BALL_SPEED = 4
/** Steps to ignore racquet contact after a hit, so one swing can't strike twice. */
const HIT_COOLDOWN_STEPS = 3

/** 0 at the back of the court, 1 at the front wall. */
const racquetForwardFactor = (paddleY: number) => {
  const travel = PADDLE_MAX_Y - PADDLE_MIN_Y
  if (travel <= 0) return 0
  return Math.max(0, Math.min(1, (PADDLE_MAX_Y - paddleY) / travel))
}

/**
 * Points for hitting the scoring wall.
 * Back of court ≈ base (10 × level); full forward ≈ base × 16 (2^4).
 */
const scoreForWallHit = (level: number, paddleY: number) => {
  const forward = racquetForwardFactor(paddleY)
  const multiplier = Math.pow(2, forward * 4)
  return Math.max(1, Math.round(10 * level * multiplier))
}
// Physics runs at a fixed 60Hz so 90/120/144Hz screens don't play faster.
const STEP_MS = 1000 / 60
const MAX_CATCH_UP_MS = 100

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

interface ScorePopup {
  id: number
  x: number
  y: number
  points: number
  ageMs: number
}

const POPUP_LIFE_MS = 900
const POPUP_RISE_PX = 48

export default function PongPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [gameState, setGameState] = useState<'start' | 'playing' | 'paused' | 'lost'>('start')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [isPointerLocked, setIsPointerLocked] = useState(false)
  
  const paddleXRef = useRef(GAME_WIDTH / 2 - PADDLE_WIDTH / 2)
  const paddleYRef = useRef(PADDLE_MAX_Y)
  const lastPaddleXRef = useRef(GAME_WIDTH / 2 - PADDLE_WIDTH / 2)
  const lastPaddleYRef = useRef(PADDLE_MAX_Y)
  const scorePopupsRef = useRef<ScorePopup[]>([])
  const popupIdRef = useRef(0)
  const hitCooldownRef = useRef(0)
  const usingTouchRef = useRef(false)
  const ballRef = useRef<Ball>({
    x: GAME_WIDTH / 2,
    y: GAME_HEIGHT / 2,
    dx: (Math.random() - 0.5) * 4,
    dy: INITIAL_BALL_SPEED,
    speed: INITIAL_BALL_SPEED,
  })
  
  const keysRef = useRef<Set<string>>(new Set())
  const gameLoopRef = useRef<number | null>(null)
  const lastFrameTimeRef = useRef<number | null>(null)
  const accumulatorRef = useRef(0)
  const rallyCountRef = useRef(0)
  const gameStateRef = useRef(gameState)

  // Keep gameStateRef in sync
  useEffect(() => {
    gameStateRef.current = gameState
  }, [gameState])

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
    if (usingTouchRef.current) return
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

  const spawnScorePopup = useCallback((x: number, y: number, points: number) => {
    popupIdRef.current += 1
    scorePopupsRef.current.push({
      id: popupIdRef.current,
      x,
      y,
      points,
      ageMs: 0,
    })
  }, [])

  const resetBall = useCallback(() => {
    const angle = (Math.random() - 0.5) * Math.PI / 4 // -22.5 to 22.5 degrees
    ballRef.current = {
      x: paddleXRef.current + PADDLE_WIDTH / 2 - BALL_SIZE / 2,
      y: paddleYRef.current - BALL_SIZE - 5,
      dx: Math.sin(angle) * INITIAL_BALL_SPEED,
      dy: -INITIAL_BALL_SPEED, // Go up toward the wall
      speed: INITIAL_BALL_SPEED,
    }
    rallyCountRef.current = 0
  }, [])

  const updateGame = useCallback((): boolean => {
    const ball = ballRef.current
    const keys = keysRef.current
    const prevPaddleX = lastPaddleXRef.current
    const prevPaddleY = lastPaddleYRef.current

    // Move racquet with keyboard (any direction)
    if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) {
      paddleXRef.current = clampPaddleX(paddleXRef.current - PADDLE_SPEED)
    }
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) {
      paddleXRef.current = clampPaddleX(paddleXRef.current + PADDLE_SPEED)
    }
    if (keys.has('ArrowUp') || keys.has('w') || keys.has('W')) {
      paddleYRef.current = clampPaddleY(paddleYRef.current - PADDLE_SPEED)
    }
    if (keys.has('ArrowDown') || keys.has('s') || keys.has('S')) {
      paddleYRef.current = clampPaddleY(paddleYRef.current + PADDLE_SPEED)
    }

    // Racquet velocity this step (mouse/touch between frames + keyboard this frame).
    // Negative velY = swinging toward the front wall.
    const paddleVelX = paddleXRef.current - prevPaddleX
    const paddleVelY = paddleYRef.current - prevPaddleY
    lastPaddleXRef.current = paddleXRef.current
    lastPaddleYRef.current = paddleYRef.current

    // Move ball
    const prevX = ball.x
    const prevY = ball.y
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
      
      // Score scales exponentially the farther forward the racquet is
      rallyCountRef.current++
      sounds.point()
      const points = scoreForWallHit(level, paddleYRef.current)
      setScore(s => s + points)
      
      // Level up every 10 bounces
      if (rallyCountRef.current % 10 === 0) {
        sounds.levelUp()
        setLevel(l => l + 1)
        // Increase speed by 10% each level
        ball.speed = Math.min(MAX_BALL_SPEED, ball.speed * 1.1)
      }
    }

    // Racquet collision - both the ball and the racquet move between steps, so the
    // faces are tested in the racquet's frame of reference. Without this a fast
    // forward swing can jump straight past the ball.
    const paddleX = paddleXRef.current
    const paddleY = paddleYRef.current
    const paddleTop = paddleY
    const paddleBottom = paddleY + PADDLE_HEIGHT
    const prevPaddleTop = prevPaddleY
    const prevPaddleBottom = prevPaddleY + PADDLE_HEIGHT

    // Sweep both bodies horizontally - swinging the racquet through the ball counts
    const ballLeft = Math.min(prevX, ball.x)
    const ballRight = Math.max(prevX, ball.x) + BALL_SIZE
    const padLeft = Math.min(prevPaddleX, paddleX)
    const padRight = Math.max(prevPaddleX, paddleX) + PADDLE_WIDTH
    const overlapsX = ballRight > padLeft && ballLeft < padRight

    if (hitCooldownRef.current > 0) {
      hitCooldownRef.current--
    } else if (overlapsX) {
      // Relative crossing: was the ball on one side of the face before, and the
      // other side after, once the racquet's own movement is accounted for?
      const crossedTop =
        prevY + BALL_SIZE <= prevPaddleTop && ball.y + BALL_SIZE >= paddleTop
      const crossedBottom =
        prevY >= prevPaddleBottom && ball.y <= paddleBottom
      const overlapsY = ball.y + BALL_SIZE > paddleTop && ball.y < paddleBottom

      if (crossedTop) {
        // Calculate bounce angle based on where ball hits paddle
        const hitPos = (ball.x + BALL_SIZE / 2 - paddleX) / PADDLE_WIDTH
        const angle = (hitPos - 0.5) * Math.PI * 0.6 // -54 to 54 degrees

        // Forward swing (toward the front wall) adds speed; pulling back softens it.
        const forwardSwing = Math.max(0, -paddleVelY)
        const backSwing = Math.max(0, paddleVelY)
        const swingBoost = Math.min(MAX_SWING_BOOST, forwardSwing * SWING_SPEED_GAIN)
        const swingLoss = backSwing * BACKSWING_SPEED_LOSS
        ball.speed = Math.min(
          MAX_BALL_SPEED,
          Math.max(MIN_BALL_SPEED, ball.speed + swingBoost - swingLoss)
        )

        // Blend a bit of sideways racquet motion into the leave angle
        ball.dx = Math.sin(angle) * ball.speed + paddleVelX * 0.15
        ball.dy = -Math.cos(angle) * ball.speed
        // Keep total speed consistent after the sideways blend
        const leaveSpeed = Math.hypot(ball.dx, ball.dy) || ball.speed
        ball.dx = (ball.dx / leaveSpeed) * ball.speed
        ball.dy = (ball.dy / leaveSpeed) * ball.speed
        ball.y = paddleTop - BALL_SIZE - 1
        hitCooldownRef.current = HIT_COOLDOWN_STEPS
        sounds.paddle()
        spawnScorePopup(
          ball.x + BALL_SIZE / 2,
          paddleTop - 8,
          scoreForWallHit(level, paddleY)
        )
      } else if (crossedBottom) {
        ball.dy = Math.abs(ball.dy)
        ball.y = paddleBottom + 1
        hitCooldownRef.current = HIT_COOLDOWN_STEPS
        sounds.paddle()
      } else if (overlapsY) {
        const fromLeft = prevX + BALL_SIZE / 2 < paddleX + PADDLE_WIDTH / 2
        ball.dx = fromLeft ? -Math.abs(ball.dx) : Math.abs(ball.dx)
        ball.x = fromLeft ? paddleX - BALL_SIZE - 1 : paddleX + PADDLE_WIDTH + 1
        hitCooldownRef.current = HIT_COOLDOWN_STEPS
        sounds.paddle()
      }
    }

    // Ball passed paddle - Game Over (check against control area top)
    if (ball.y > GAME_HEIGHT - CONTROL_AREA_HEIGHT) {
      sounds.lose()
      setGameState('lost')
      return false
    }

    return true
  }, [level, spawnScorePopup])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const paddleX = paddleXRef.current
    const paddleY = paddleYRef.current
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

    // Draw top wall (target wall with glow)
    ctx.fillStyle = '#22c55e'
    ctx.shadowColor = '#22c55e'
    ctx.shadowBlur = 10
    ctx.fillRect(0, 0, GAME_WIDTH, 8)
    ctx.shadowBlur = 0

    // Draw player racquet (cyan) - T-shaped with handle
    ctx.fillStyle = '#06b6d4'
    ctx.shadowColor = '#06b6d4'
    ctx.shadowBlur = 15
    // Racquet head
    ctx.fillRect(paddleX, paddleY, PADDLE_WIDTH, PADDLE_HEIGHT)
    // Racquet stem/handle extending down
    const stemWidth = 8
    const stemX = paddleX + PADDLE_WIDTH / 2 - stemWidth / 2
    ctx.fillRect(stemX, paddleY + PADDLE_HEIGHT, stemWidth, HANDLE_LENGTH)
    ctx.shadowBlur = 0
    
    // Draw hand icon at bottom of stem
    const handY = paddleY + PADDLE_HEIGHT + HANDLE_LENGTH
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

    // Floating green +points popups (racquet contact / wall score)
    for (const popup of scorePopupsRef.current) {
      const t = Math.min(1, popup.ageMs / POPUP_LIFE_MS)
      const rise = POPUP_RISE_PX * t
      const alpha = 1 - t
      ctx.save()
      ctx.globalAlpha = Math.max(0, alpha)
      ctx.fillStyle = '#22c55e'
      ctx.shadowColor = '#22c55e'
      ctx.shadowBlur = 12
      ctx.font = 'bold 22px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`+${popup.points}`, popup.x, popup.y - rise)
      ctx.restore()
    }
  }, [isPointerLocked])

  const gameLoop = useCallback((timestamp: number) => {
    if (gameState === 'playing') {
      const lastTimestamp = lastFrameTimeRef.current
      lastFrameTimeRef.current = timestamp

      if (lastTimestamp !== null) {
        const frameDelta = Math.min(timestamp - lastTimestamp, MAX_CATCH_UP_MS)
        accumulatorRef.current = Math.min(
          accumulatorRef.current + frameDelta,
          MAX_CATCH_UP_MS
        )
        while (accumulatorRef.current >= STEP_MS) {
          accumulatorRef.current -= STEP_MS
          if (!updateGame()) {
            accumulatorRef.current = 0
            break
          }
        }

        // Age score popups in real time so they keep floating after a hit
        if (scorePopupsRef.current.length > 0) {
          scorePopupsRef.current = scorePopupsRef.current
            .map((popup) => ({ ...popup, ageMs: popup.ageMs + frameDelta }))
            .filter((popup) => popup.ageMs < POPUP_LIFE_MS)
        }
      }

      draw()
    }
    gameLoopRef.current = requestAnimationFrame(gameLoop)
  }, [gameState, updateGame, draw])

  // Reset frame timing so a pause or tab switch doesn't fast-forward the ball
  useEffect(() => {
    lastFrameTimeRef.current = null
    accumulatorRef.current = 0
    lastPaddleXRef.current = paddleXRef.current
    lastPaddleYRef.current = paddleYRef.current
  }, [gameState])

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
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'a', 'd', 'A', 'D', 'w', 's', 'W', 'S', ' ', 'p', 'P', 'Escape'].includes(e.key)) {
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
      // Touch devices emit compatibility mouse events; they use a different grip
      // offset and would yank the racquet up under the finger.
      if (usingTouchRef.current) return
      
      // Use movementX/movementY for pointer-locked control (relative movement)
      if (document.pointerLockElement === canvas) {
        paddleXRef.current = clampPaddleX(paddleXRef.current + e.movementX * MOUSE_SENSITIVITY)
        paddleYRef.current = clampPaddleY(paddleYRef.current + e.movementY * MOUSE_SENSITIVITY)
      } else {
        // Fallback: absolute position when not locked
        const rect = canvas.getBoundingClientRect()
        const scaledX = ((e.clientX - rect.left) / rect.width) * GAME_WIDTH
        const scaledY = ((e.clientY - rect.top) / rect.height) * GAME_HEIGHT
        paddleXRef.current = clampPaddleX(scaledX - PADDLE_WIDTH / 2)
        paddleYRef.current = clampPaddleY(scaledY - PADDLE_HEIGHT / 2)
      }
    }

    // Click to lock pointer during gameplay
    const handleClick = () => {
      if (usingTouchRef.current) return
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
      usingTouchRef.current = true
      if (gameStateRef.current !== 'playing') return
      if (e.touches.length > 0) {
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const scaledX = ((e.touches[0].clientX - rect.left) / rect.width) * GAME_WIDTH
        const scaledY = ((e.touches[0].clientY - rect.top) / rect.height) * GAME_HEIGHT
        paddleXRef.current = clampPaddleX(scaledX - PADDLE_WIDTH / 2)
        // Grip sits under the finger so the racquet head stays visible above it
        paddleYRef.current = clampPaddleY(scaledY - PADDLE_HEIGHT - HANDLE_LENGTH)
      }
    }

    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchstart', handleTouchMove, { passive: false })
    return () => {
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchstart', handleTouchMove)
    }
  }, [])

  // Any touch marks this as a touch session, so mouse handlers and pointer lock stay off
  useEffect(() => {
    const markTouch = () => {
      usingTouchRef.current = true
    }
    document.addEventListener('touchstart', markTouch, { passive: true, capture: true })
    return () => {
      document.removeEventListener('touchstart', markTouch, { capture: true })
    }
  }, [])

  // Keep the page still while playing - dragging outside the court must not scroll it
  useEffect(() => {
    if (gameState !== 'playing') return

    const { body, documentElement } = document
    const prevBodyOverflow = body.style.overflow
    const prevBodyOverscroll = body.style.overscrollBehavior
    const prevHtmlOverflow = documentElement.style.overflow
    const prevHtmlOverscroll = documentElement.style.overscrollBehavior

    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    documentElement.style.overflow = 'hidden'
    documentElement.style.overscrollBehavior = 'none'

    const blockScroll = (e: TouchEvent) => {
      e.preventDefault()
    }
    document.addEventListener('touchmove', blockScroll, { passive: false })

    return () => {
      body.style.overflow = prevBodyOverflow
      body.style.overscrollBehavior = prevBodyOverscroll
      documentElement.style.overflow = prevHtmlOverflow
      documentElement.style.overscrollBehavior = prevHtmlOverscroll
      document.removeEventListener('touchmove', blockScroll)
    }
  }, [gameState])

  const startGame = () => {
    resumeAudio()
    setScore(0)
    setLevel(1)
    paddleXRef.current = GAME_WIDTH / 2 - PADDLE_WIDTH / 2
    paddleYRef.current = PADDLE_MAX_Y
    lastPaddleXRef.current = paddleXRef.current
    lastPaddleYRef.current = paddleYRef.current
    scorePopupsRef.current = []
    hitCooldownRef.current = 0
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
            className="rounded-lg max-w-full cursor-none touch-none select-none"
            style={{ imageRendering: 'pixelated', touchAction: 'none' }}
          />

          {/* Overlays - on top of game canvas */}
          {gameState === 'start' && (
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-lg flex flex-col items-center justify-center gap-3">
              <div className="text-4xl font-black text-white tracking-widest" style={{ fontFamily: 'monospace' }}>
                RACQUETBALL
              </div>
              <div className="text-gray-300 text-xs text-center px-6">
                Move the racquet any direction to keep the ball in play.<br />
                Swing forward to hit harder — and score more near the wall!
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
          <p>Mouse moves the racquet freely • Swing forward to add speed • Forward position scores exponentially more • P to pause</p>
        </div>

      </div>
    </div>
  )
}
