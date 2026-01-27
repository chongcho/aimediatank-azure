'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { tetrisSounds, resumeAudio } from '@/lib/gameSound'

// Tetromino shapes
const TETROMINOES = {
  I: {
    shape: [[1, 1, 1, 1]],
    color: '#00f5ff', // Cyan
  },
  O: {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: '#ffd700', // Gold
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
    ],
    color: '#a855f7', // Purple
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    color: '#22c55e', // Green
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
    ],
    color: '#ef4444', // Red
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    color: '#3b82f6', // Blue
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    color: '#f97316', // Orange
  },
}

type TetrominoKey = keyof typeof TETROMINOES

const BOARD_WIDTH = 13
const BOARD_HEIGHT = 23
const INITIAL_SPEED = 800
const SPEED_INCREMENT = 50
const MIN_SPEED = 100

interface Position {
  x: number
  y: number
}

interface Piece {
  shape: number[][]
  color: string
  position: Position
  type: TetrominoKey
}

const createEmptyBoard = () =>
  Array.from({ length: BOARD_HEIGHT }, () =>
    Array.from({ length: BOARD_WIDTH }, () => null as string | null)
  )

const getRandomTetromino = (): TetrominoKey => {
  const keys = Object.keys(TETROMINOES) as TetrominoKey[]
  return keys[Math.floor(Math.random() * keys.length)]
}

const rotatePiece = (shape: number[][]): number[][] => {
  const rows = shape.length
  const cols = shape[0].length
  const rotated: number[][] = []
  for (let col = 0; col < cols; col++) {
    const newRow: number[] = []
    for (let row = rows - 1; row >= 0; row--) {
      newRow.push(shape[row][col])
    }
    rotated.push(newRow)
  }
  return rotated
}

export default function GamePage() {
  const [board, setBoard] = useState<(string | null)[][]>(createEmptyBoard())
  const [currentPiece, setCurrentPiece] = useState<Piece | null>(null)
  const [nextPiece, setNextPiece] = useState<TetrominoKey>(getRandomTetromino())
  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [level, setLevel] = useState(1)
  const [gameOver, setGameOver] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [highScore, setHighScore] = useState(0)
  
  const gameLoopRef = useRef<NodeJS.Timeout | null>(null)
  const speedRef = useRef(INITIAL_SPEED)

  // Load high score from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('tetris-highscore')
    if (saved) setHighScore(parseInt(saved))
  }, [])

  // Save high score
  useEffect(() => {
    if (score > highScore) {
      setHighScore(score)
      localStorage.setItem('tetris-highscore', score.toString())
    }
  }, [score, highScore])

  const spawnPiece = useCallback(() => {
    const type = nextPiece
    const tetromino = TETROMINOES[type]
    const piece: Piece = {
      shape: tetromino.shape,
      color: tetromino.color,
      position: {
        x: Math.floor(BOARD_WIDTH / 2) - Math.floor(tetromino.shape[0].length / 2),
        y: 0,
      },
      type,
    }
    setNextPiece(getRandomTetromino())
    return piece
  }, [nextPiece])

  const isValidMove = useCallback(
    (piece: Piece, board: (string | null)[][], offsetX = 0, offsetY = 0) => {
      for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
          if (piece.shape[row][col]) {
            const newX = piece.position.x + col + offsetX
            const newY = piece.position.y + row + offsetY
            if (
              newX < 0 ||
              newX >= BOARD_WIDTH ||
              newY >= BOARD_HEIGHT ||
              (newY >= 0 && board[newY][newX])
            ) {
              return false
            }
          }
        }
      }
      return true
    },
    []
  )

  const placePiece = useCallback(
    (piece: Piece, board: (string | null)[][]) => {
      const newBoard = board.map((row) => [...row])
      for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
          if (piece.shape[row][col]) {
            const y = piece.position.y + row
            const x = piece.position.x + col
            if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
              newBoard[y][x] = piece.color
            }
          }
        }
      }
      return newBoard
    },
    []
  )

  const clearLines = useCallback((board: (string | null)[][]) => {
    let linesCleared = 0
    const newBoard = board.filter((row) => {
      const isFull = row.every((cell) => cell !== null)
      if (isFull) linesCleared++
      return !isFull
    })
    while (newBoard.length < BOARD_HEIGHT) {
      newBoard.unshift(Array(BOARD_WIDTH).fill(null))
    }
    return { newBoard, linesCleared }
  }, [])

  const calculateScore = useCallback((linesCleared: number, level: number) => {
    const points = [0, 100, 300, 500, 800]
    return points[linesCleared] * level
  }, [])

  const moveDown = useCallback(() => {
    if (!currentPiece || isPaused || gameOver) return

    if (isValidMove(currentPiece, board, 0, 1)) {
      setCurrentPiece((prev) =>
        prev ? { ...prev, position: { ...prev.position, y: prev.position.y + 1 } } : null
      )
    } else {
      // Place piece and spawn new one
      const newBoard = placePiece(currentPiece, board)
      const { newBoard: clearedBoard, linesCleared } = clearLines(newBoard)
      
      setBoard(clearedBoard)
      setLines((prev) => prev + linesCleared)
      setScore((prev) => prev + calculateScore(linesCleared, level))
      
      // Play sound for line clears
      if (linesCleared === 4) {
        tetrisSounds.tetris()
      } else if (linesCleared > 0) {
        tetrisSounds.lineClear()
      }
      
      // Level up every 10 lines
      const newLevel = Math.floor((lines + linesCleared) / 10) + 1
      if (newLevel > level) {
        setLevel(newLevel)
        tetrisSounds.levelUp()
        speedRef.current = Math.max(MIN_SPEED, INITIAL_SPEED - (newLevel - 1) * SPEED_INCREMENT)
      }

      // Spawn new piece
      const newPiece = spawnPiece()
      if (!isValidMove(newPiece, clearedBoard)) {
        tetrisSounds.gameOver()
        setGameOver(true)
        setIsPlaying(false)
        setCurrentPiece(null)
      } else {
        setCurrentPiece(newPiece)
      }
    }
  }, [currentPiece, board, isPaused, gameOver, isValidMove, placePiece, clearLines, calculateScore, level, lines, spawnPiece])

  const moveLeft = useCallback(() => {
    if (!currentPiece || isPaused || gameOver) return
    if (isValidMove(currentPiece, board, -1, 0)) {
      tetrisSounds.move()
      setCurrentPiece((prev) =>
        prev ? { ...prev, position: { ...prev.position, x: prev.position.x - 1 } } : null
      )
    }
  }, [currentPiece, board, isPaused, gameOver, isValidMove])

  const moveRight = useCallback(() => {
    if (!currentPiece || isPaused || gameOver) return
    if (isValidMove(currentPiece, board, 1, 0)) {
      tetrisSounds.move()
      setCurrentPiece((prev) =>
        prev ? { ...prev, position: { ...prev.position, x: prev.position.x + 1 } } : null
      )
    }
  }, [currentPiece, board, isPaused, gameOver, isValidMove])

  const rotate = useCallback(() => {
    if (!currentPiece || isPaused || gameOver) return
    const rotatedShape = rotatePiece(currentPiece.shape)
    const rotatedPiece = { ...currentPiece, shape: rotatedShape }
    
    // Try normal rotation
    if (isValidMove(rotatedPiece, board)) {
      tetrisSounds.rotate()
      setCurrentPiece(rotatedPiece)
      return
    }
    
    // Wall kick - try moving left or right
    for (const offset of [-1, 1, -2, 2]) {
      const kickedPiece = {
        ...rotatedPiece,
        position: { ...rotatedPiece.position, x: rotatedPiece.position.x + offset },
      }
      if (isValidMove(kickedPiece, board)) {
        tetrisSounds.rotate()
        setCurrentPiece(kickedPiece)
        return
      }
    }
  }, [currentPiece, board, isPaused, gameOver, isValidMove])

  const hardDrop = useCallback(() => {
    if (!currentPiece || isPaused || gameOver) return
    let dropDistance = 0
    while (isValidMove(currentPiece, board, 0, dropDistance + 1)) {
      dropDistance++
    }
    tetrisSounds.drop()
    setCurrentPiece((prev) =>
      prev ? { ...prev, position: { ...prev.position, y: prev.position.y + dropDistance } } : null
    )
    setScore((prev) => prev + dropDistance * 2)
    // Trigger immediate placement
    setTimeout(moveDown, 0)
  }, [currentPiece, board, isPaused, gameOver, isValidMove, moveDown])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isPlaying) return
      
      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          moveLeft()
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          moveRight()
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          moveDown()
          break
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          rotate()
          break
        case ' ':
          e.preventDefault()
          hardDrop()
          break
        case 'p':
        case 'P':
        case 'Escape':
          e.preventDefault()
          setIsPaused((prev) => !prev)
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, moveLeft, moveRight, moveDown, rotate, hardDrop])

  // Game loop
  useEffect(() => {
    if (isPlaying && !isPaused && !gameOver) {
      gameLoopRef.current = setInterval(moveDown, speedRef.current)
    }
    return () => {
      if (gameLoopRef.current) clearInterval(gameLoopRef.current)
    }
  }, [isPlaying, isPaused, gameOver, moveDown])

  const startGame = () => {
    resumeAudio()
    setBoard(createEmptyBoard())
    setScore(0)
    setLines(0)
    setLevel(1)
    setGameOver(false)
    setIsPaused(false)
    speedRef.current = INITIAL_SPEED
    setNextPiece(getRandomTetromino())
    
    const type = getRandomTetromino()
    const tetromino = TETROMINOES[type]
    setCurrentPiece({
      shape: tetromino.shape,
      color: tetromino.color,
      position: {
        x: Math.floor(BOARD_WIDTH / 2) - Math.floor(tetromino.shape[0].length / 2),
        y: 0,
      },
      type,
    })
    setIsPlaying(true)
  }

  // Render the board with current piece
  const renderBoard = () => {
    const displayBoard = board.map((row) => [...row])
    
    // Add current piece to display
    if (currentPiece) {
      // Add ghost piece (preview of where piece will land)
      let ghostY = currentPiece.position.y
      while (isValidMove({ ...currentPiece, position: { ...currentPiece.position, y: ghostY + 1 } }, board)) {
        ghostY++
      }
      
      for (let row = 0; row < currentPiece.shape.length; row++) {
        for (let col = 0; col < currentPiece.shape[row].length; col++) {
          if (currentPiece.shape[row][col]) {
            const y = ghostY + row
            const x = currentPiece.position.x + col
            if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH && !displayBoard[y][x]) {
              displayBoard[y][x] = `ghost-${currentPiece.color}`
            }
          }
        }
      }
      
      // Add actual piece
      for (let row = 0; row < currentPiece.shape.length; row++) {
        for (let col = 0; col < currentPiece.shape[row].length; col++) {
          if (currentPiece.shape[row][col]) {
            const y = currentPiece.position.y + row
            const x = currentPiece.position.x + col
            if (y >= 0 && y < BOARD_HEIGHT && x >= 0 && x < BOARD_WIDTH) {
              displayBoard[y][x] = currentPiece.color
            }
          }
        }
      }
    }
    
    return displayBoard
  }

  const renderNextPiece = () => {
    const tetromino = TETROMINOES[nextPiece]
    return (
      <div className="flex flex-col items-center gap-[1px]">
        {tetromino.shape.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-[1px]">
            {row.map((cell, cellIndex) => (
              <div
                key={cellIndex}
                className="w-4 h-4 sm:w-5 sm:h-5 rounded-sm"
                style={{
                  backgroundColor: cell ? tetromino.color : 'transparent',
                  boxShadow: cell ? `inset 0 0 8px rgba(255,255,255,0.3), 0 0 4px ${tetromino.color}` : 'none',
                }}
              />
            ))}
          </div>
        ))}
      </div>
    )
  }

  const displayBoard = renderBoard()

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-950 to-gray-900 flex flex-col" style={{ paddingTop: '10px' }}>
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
      </div>

      {/* Compact Stats Bar - Mobile */}
      <div className="sm:hidden px-2 mb-2 relative z-10">
        <div className="bg-gray-800/70 backdrop-blur-sm rounded-lg px-2 py-1.5 flex items-center justify-between border border-gray-700/50">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 uppercase">Score</span>
            <span className="text-xs font-bold text-cyan-400 min-w-[28px]">{score}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 uppercase">Level</span>
            <span className="text-xs font-bold text-purple-400 min-w-[16px]">{level}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 uppercase">Lines</span>
            <span className="text-xs font-bold text-cyan-400 min-w-[16px]">{lines}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-400 uppercase">Best</span>
            <span className="text-xs font-bold text-yellow-400 min-w-[28px]">{highScore}</span>
          </div>
        </div>
      </div>

      {/* Main Game Area - Mobile Optimized */}
      <div className="sm:hidden px-2 relative z-10">
        <div className="flex gap-2 justify-center items-start">
          {/* Game Board */}
          <div className="relative h-fit">
            <div className="bg-gray-900/80 backdrop-blur-sm rounded-xl p-2 border-2 border-purple-500/30 shadow-xl">
              <div 
                className="grid gap-[1px] bg-gray-950 p-1 rounded-lg"
                style={{ 
                  gridTemplateColumns: `repeat(${BOARD_WIDTH}, minmax(0, 1fr))`,
                }}
              >
                {displayBoard.map((row, rowIndex) =>
                  row.map((cell, cellIndex) => {
                    const isGhost = cell?.startsWith('ghost-') ?? false
                    const color = isGhost && cell ? cell.replace('ghost-', '') : cell
                    return (
                      <div
                        key={`${rowIndex}-${cellIndex}`}
                        className="w-[14px] h-[14px] rounded-[2px] transition-colors duration-75"
                        style={{
                          backgroundColor: color 
                            ? isGhost 
                              ? `${color}33` 
                              : color 
                            : 'rgba(30, 30, 40, 0.8)',
                          boxShadow: color && !isGhost
                            ? `inset 0 0 6px rgba(255,255,255,0.3), 0 0 4px ${color}80`
                            : isGhost
                              ? `inset 0 0 3px ${color}40`
                              : 'inset 0 0 3px rgba(0,0,0,0.5)',
                          border: isGhost ? `1px dashed ${color}80` : 'none',
                        }}
                      />
                    )
                  })
                )}
              </div>
            </div>

            {/* Game Over / Pause Overlay - Same size as game board */}
            {(gameOver || (isPaused && isPlaying)) && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-2">
                <div className="text-lg font-black text-white">
                  {gameOver ? 'GAME OVER' : 'PAUSED'}
                </div>
                {gameOver && (
                  <div className="text-xs text-gray-300">
                    Score: <span className="text-yellow-400 font-bold">{score}</span>
                  </div>
                )}
                <button
                  onClick={gameOver ? startGame : () => setIsPaused(false)}
                  className="px-4 py-1.5 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg font-bold text-white text-xs"
                >
                  {gameOver ? 'Play Again' : 'Resume'}
                </button>
              </div>
            )}

            {/* Start Screen - Same size as game board */}
            {!isPlaying && !gameOver && (
              <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-xl flex flex-col items-center justify-center gap-2">
                {/* Mini Tetris Icon */}
                <div className="flex flex-col items-center gap-[2px] mb-1">
                  <div className="flex gap-[2px]">
                    <div className="w-3 h-3 rounded-sm bg-purple-500 shadow-[inset_0_0_4px_rgba(255,255,255,0.3)]" />
                    <div className="w-3 h-3 rounded-sm bg-purple-500 shadow-[inset_0_0_4px_rgba(255,255,255,0.3)]" />
                    <div className="w-3 h-3 rounded-sm bg-purple-500 shadow-[inset_0_0_4px_rgba(255,255,255,0.3)]" />
                  </div>
                  <div className="flex gap-[2px]">
                    <div className="w-3 h-3 rounded-sm bg-transparent" />
                    <div className="w-3 h-3 rounded-sm bg-purple-500 shadow-[inset_0_0_4px_rgba(255,255,255,0.3)]" />
                    <div className="w-3 h-3 rounded-sm bg-transparent" />
                  </div>
                  <div className="flex gap-[2px]">
                    <div className="w-3 h-3 rounded-sm bg-cyan-400 shadow-[inset_0_0_4px_rgba(255,255,255,0.3)]" />
                    <div className="w-3 h-3 rounded-sm bg-yellow-400 shadow-[inset_0_0_4px_rgba(255,255,255,0.3)]" />
                    <div className="w-3 h-3 rounded-sm bg-green-500 shadow-[inset_0_0_4px_rgba(255,255,255,0.3)]" />
                  </div>
                </div>
                <div className="text-lg font-black bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                  TETRIS
                </div>
                <button
                  onClick={startGame}
                  className="px-5 py-1.5 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-lg font-bold text-white text-xs shadow-lg"
                >
                  START
                </button>
              </div>
            )}
          </div>

          {/* Next Piece Panel - Mobile */}
          <div className="flex flex-col gap-2">
            <div className="bg-gray-800/70 backdrop-blur-sm rounded-lg p-2 border border-gray-700/50">
              <div className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 text-center font-bold">NEXT</div>
              <div className="flex justify-center items-center min-h-[40px] bg-gray-900/50 rounded p-1.5">
                {renderNextPiece()}
              </div>
            </div>
            {/* Pause Button */}
            {isPlaying && !gameOver && (
              <button
                onClick={() => setIsPaused(!isPaused)}
                className="bg-gray-700/80 hover:bg-gray-600 rounded-lg py-1.5 text-xs font-medium text-white"
              >
                {isPaused ? '▶' : '❚❚'}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Touch Controls - Single Row */}
        <div className="mt-2 px-2" style={{ marginBottom: '50px' }}>
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-2 border border-gray-700/50">
            <div className="flex justify-center items-center gap-2">
              {/* Left */}
              <button
                onTouchStart={(e) => { e.preventDefault(); moveLeft() }}
                className="w-12 h-12 bg-violet-700/80 rounded-xl active:bg-violet-600 flex items-center justify-center shadow-lg"
              >
                <span className="text-white text-xl font-bold">←</span>
              </button>

              {/* Hard Drop - Yellow */}
              <button
                onTouchStart={(e) => { e.preventDefault(); hardDrop() }}
                className="w-12 h-12 bg-yellow-500/90 rounded-xl active:bg-yellow-400 flex items-center justify-center shadow-lg"
              >
                <span className="text-gray-900 text-xl font-bold">⬇</span>
              </button>

              {/* Soft Drop - Cyan */}
              <button
                onTouchStart={(e) => { e.preventDefault(); moveDown() }}
                className="w-12 h-12 bg-cyan-600/80 rounded-xl active:bg-cyan-500 flex items-center justify-center shadow-lg"
              >
                <span className="text-white text-xl font-bold">↓</span>
              </button>

              {/* Right */}
              <button
                onTouchStart={(e) => { e.preventDefault(); moveRight() }}
                className="w-12 h-12 bg-violet-700/80 rounded-xl active:bg-violet-600 flex items-center justify-center shadow-lg"
              >
                <span className="text-white text-xl font-bold">→</span>
              </button>

              {/* Rotate */}
              <button
                onTouchStart={(e) => { e.preventDefault(); rotate() }}
                className="w-12 h-12 bg-cyan-700/80 rounded-xl active:bg-cyan-600 flex items-center justify-center shadow-lg"
              >
                <span className="text-white text-xl font-bold">↻</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden sm:block flex-1 px-4 pb-8 relative z-10" style={{ paddingTop: '30px' }}>
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6">
            {/* Left Panel - Stats */}
            <div className="flex lg:flex-col gap-4 lg:gap-6 order-2 lg:order-1">
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50 min-w-[120px]">
                <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Score</div>
                <div className="text-2xl font-bold text-white">{score.toLocaleString()}</div>
              </div>
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50 min-w-[120px]">
                <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">High Score</div>
                <div className="text-2xl font-bold text-yellow-400">{highScore.toLocaleString()}</div>
              </div>
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50 min-w-[120px]">
                <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Level</div>
                <div className="text-2xl font-bold text-purple-400">{level}</div>
              </div>
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50 min-w-[120px]">
                <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Lines</div>
                <div className="text-2xl font-bold text-cyan-400">{lines}</div>
              </div>
            </div>

            {/* Game Board */}
            <div className="relative order-1 lg:order-2">
              <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-3 sm:p-4 border-2 border-purple-500/30 shadow-2xl shadow-purple-500/20">
                <div 
                  className="grid gap-[2px] bg-gray-950 p-2 rounded-lg"
                  style={{ 
                    gridTemplateColumns: `repeat(${BOARD_WIDTH}, minmax(0, 1fr))`,
                  }}
                >
                  {displayBoard.map((row, rowIndex) =>
                    row.map((cell, cellIndex) => {
                      const isGhost = cell?.startsWith('ghost-') ?? false
                      const color = isGhost && cell ? cell.replace('ghost-', '') : cell
                      return (
                        <div
                          key={`${rowIndex}-${cellIndex}`}
                          className="w-5 h-5 sm:w-7 sm:h-7 rounded-sm transition-colors duration-75"
                          style={{
                            backgroundColor: color 
                              ? isGhost 
                                ? `${color}33` 
                                : color 
                              : 'rgba(30, 30, 40, 0.8)',
                            boxShadow: color && !isGhost
                              ? `inset 0 0 10px rgba(255,255,255,0.3), 0 0 8px ${color}80`
                              : isGhost
                                ? `inset 0 0 5px ${color}40`
                                : 'inset 0 0 5px rgba(0,0,0,0.5)',
                            border: isGhost ? `1px dashed ${color}80` : 'none',
                          }}
                        />
                      )
                    })
                  )}
                </div>
              </div>

              {/* Game Over / Pause Overlay */}
              {(gameOver || (isPaused && isPlaying)) && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-3">
                  <div className="text-2xl font-black text-white">
                    {gameOver ? 'GAME OVER' : 'PAUSED'}
                  </div>
                  {gameOver && (
                    <div className="text-sm text-gray-300">
                      Score: <span className="text-yellow-400 font-bold">{score.toLocaleString()}</span>
                    </div>
                  )}
                  <button
                    onClick={gameOver ? startGame : () => setIsPaused(false)}
                    className="px-5 py-2 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg font-bold text-white hover:scale-105 transition-transform"
                  >
                    {gameOver ? 'Play Again' : 'Resume'}
                  </button>
                </div>
              )}

              {/* Start Screen */}
              {!isPlaying && !gameOver && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-3">
                  {/* Tetris Icon - Stack of colorful blocks */}
                  <div className="flex flex-col items-center gap-[3px] mb-2">
                    {/* T piece */}
                    <div className="flex gap-[3px]">
                      <div className="w-5 h-5 rounded-sm bg-purple-500 shadow-[inset_0_0_8px_rgba(255,255,255,0.3),0_0_6px_#a855f7]" />
                      <div className="w-5 h-5 rounded-sm bg-purple-500 shadow-[inset_0_0_8px_rgba(255,255,255,0.3),0_0_6px_#a855f7]" />
                      <div className="w-5 h-5 rounded-sm bg-purple-500 shadow-[inset_0_0_8px_rgba(255,255,255,0.3),0_0_6px_#a855f7]" />
                    </div>
                    <div className="flex gap-[3px]">
                      <div className="w-5 h-5 rounded-sm bg-transparent" />
                      <div className="w-5 h-5 rounded-sm bg-purple-500 shadow-[inset_0_0_8px_rgba(255,255,255,0.3),0_0_6px_#a855f7]" />
                      <div className="w-5 h-5 rounded-sm bg-transparent" />
                    </div>
                    {/* Bottom row with mixed pieces */}
                    <div className="flex gap-[3px]">
                      <div className="w-5 h-5 rounded-sm bg-cyan-400 shadow-[inset_0_0_8px_rgba(255,255,255,0.3),0_0_6px_#00f5ff]" />
                      <div className="w-5 h-5 rounded-sm bg-yellow-400 shadow-[inset_0_0_8px_rgba(255,255,255,0.3),0_0_6px_#ffd700]" />
                      <div className="w-5 h-5 rounded-sm bg-green-500 shadow-[inset_0_0_8px_rgba(255,255,255,0.3),0_0_6px_#22c55e]" />
                    </div>
                    <div className="flex gap-[3px]">
                      <div className="w-5 h-5 rounded-sm bg-cyan-400 shadow-[inset_0_0_8px_rgba(255,255,255,0.3),0_0_6px_#00f5ff]" />
                      <div className="w-5 h-5 rounded-sm bg-yellow-400 shadow-[inset_0_0_8px_rgba(255,255,255,0.3),0_0_6px_#ffd700]" />
                      <div className="w-5 h-5 rounded-sm bg-red-500 shadow-[inset_0_0_8px_rgba(255,255,255,0.3),0_0_6px_#ef4444]" />
                    </div>
                  </div>
                  <div className="text-2xl font-black bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
                    TETRIS
                  </div>
                  <button
                    onClick={startGame}
                    className="px-6 py-2 bg-gradient-to-r from-cyan-500 to-purple-500 rounded-lg font-bold text-white hover:scale-105 transition-transform shadow-lg shadow-purple-500/30"
                  >
                    START
                  </button>
                </div>
              )}
            </div>

            {/* Right Panel - Next Piece & Controls */}
            <div className="flex lg:flex-col gap-4 lg:gap-6 order-3">
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
                <div className="text-gray-400 text-xs uppercase tracking-wider mb-3 text-center">Next</div>
                <div className="flex justify-center min-h-[60px] items-center">
                  {renderNextPiece()}
                </div>
              </div>

              {/* Controls Info */}
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl p-4 border border-gray-700/50">
                <div className="text-gray-400 text-xs uppercase tracking-wider mb-3">Controls</div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Move</span>
                    <span className="text-gray-300">← → ↓</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Rotate</span>
                    <span className="text-gray-300">↑ / W</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Drop</span>
                    <span className="text-gray-300">Space</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Pause</span>
                    <span className="text-gray-300">P / Esc</span>
                  </div>
                </div>
              </div>

              {/* Pause & Quit Buttons */}
              {isPlaying && !gameOver && (
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setIsPaused(!isPaused)}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-white transition-colors"
                  >
                    {isPaused ? 'Resume' : 'Pause'}
                  </button>
                  <button
                    onClick={() => {
                      setIsPlaying(false)
                      setGameOver(true)
                      if (gameLoopRef.current) clearInterval(gameLoopRef.current)
                    }}
                    className="px-4 py-2 bg-red-600/80 hover:bg-red-500 rounded-lg font-medium text-white transition-colors"
                  >
                    Quit
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
