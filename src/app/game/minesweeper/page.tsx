'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { minesweeperSounds, resumeAudio } from '@/lib/gameSound'

type CellState = {
  isMine: boolean
  isRevealed: boolean
  isFlagged: boolean
  adjacentMines: number
}

type Difficulty = 'easy' | 'medium' | 'hard'

const DIFFICULTIES = {
  easy: { rows: 9, cols: 9, mines: 10 },
  medium: { rows: 16, cols: 16, mines: 40 },
  hard: { rows: 16, cols: 30, mines: 99 },
}

const createEmptyBoard = (rows: number, cols: number): CellState[][] => {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => ({
      isMine: false,
      isRevealed: false,
      isFlagged: false,
      adjacentMines: 0,
    }))
  )
}

const placeMines = (
  board: CellState[][],
  mines: number,
  excludeRow: number,
  excludeCol: number
): CellState[][] => {
  const rows = board.length
  const cols = board[0].length
  const newBoard = board.map(row => row.map(cell => ({ ...cell })))
  
  let placed = 0
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows)
    const c = Math.floor(Math.random() * cols)
    
    // Don't place mine on first click or adjacent cells
    const isExcluded = Math.abs(r - excludeRow) <= 1 && Math.abs(c - excludeCol) <= 1
    
    if (!newBoard[r][c].isMine && !isExcluded) {
      newBoard[r][c].isMine = true
      placed++
    }
  }
  
  // Calculate adjacent mines
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!newBoard[r][c].isMine) {
        let count = 0
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr
            const nc = c + dc
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && newBoard[nr][nc].isMine) {
              count++
            }
          }
        }
        newBoard[r][c].adjacentMines = count
      }
    }
  }
  
  return newBoard
}

export default function MinesweeperPage() {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [board, setBoard] = useState<CellState[][]>([])
  const [gameState, setGameState] = useState<'waiting' | 'playing' | 'won' | 'lost'>('waiting')
  const [flagCount, setFlagCount] = useState(0)
  const [time, setTime] = useState(0)
  const [firstClick, setFirstClick] = useState(true)
  
  const { rows, cols, mines } = DIFFICULTIES[difficulty]

  // Initialize board
  useEffect(() => {
    setBoard(createEmptyBoard(rows, cols))
    setGameState('waiting')
    setFlagCount(0)
    setTime(0)
    setFirstClick(true)
  }, [difficulty, rows, cols])

  // Timer
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null
    if (gameState === 'playing') {
      interval = setInterval(() => {
        setTime(t => t + 1)
      }, 1000)
    }
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [gameState])

  const revealCell = useCallback((board: CellState[][], row: number, col: number): CellState[][] => {
    const rows = board.length
    const cols = board[0].length
    const newBoard = board.map(r => r.map(c => ({ ...c })))
    
    const reveal = (r: number, c: number) => {
      if (r < 0 || r >= rows || c < 0 || c >= cols) return
      if (newBoard[r][c].isRevealed || newBoard[r][c].isFlagged) return
      
      newBoard[r][c].isRevealed = true
      
      if (newBoard[r][c].adjacentMines === 0 && !newBoard[r][c].isMine) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            reveal(r + dr, c + dc)
          }
        }
      }
    }
    
    reveal(row, col)
    return newBoard
  }, [])

  const checkWin = useCallback((board: CellState[][]): boolean => {
    for (const row of board) {
      for (const cell of row) {
        if (!cell.isMine && !cell.isRevealed) {
          return false
        }
      }
    }
    return true
  }, [])

  const handleCellClick = (row: number, col: number) => {
    if (gameState === 'won' || gameState === 'lost') return
    if (board[row][col].isFlagged || board[row][col].isRevealed) return

    resumeAudio()
    let currentBoard = board

    // First click - place mines avoiding clicked cell
    if (firstClick) {
      currentBoard = placeMines(board, mines, row, col)
      setFirstClick(false)
      setGameState('playing')
    }

    // Check if mine
    if (currentBoard[row][col].isMine) {
      minesweeperSounds.explosion()
      // Reveal all mines
      const lostBoard = currentBoard.map(r =>
        r.map(c => ({
          ...c,
          isRevealed: c.isMine ? true : c.isRevealed,
        }))
      )
      setBoard(lostBoard)
      setGameState('lost')
      return
    }

    // Reveal cell(s)
    minesweeperSounds.reveal()
    const newBoard = revealCell(currentBoard, row, col)
    setBoard(newBoard)

    // Check win
    if (checkWin(newBoard)) {
      minesweeperSounds.win()
      setGameState('won')
    }
  }

  const handleRightClick = (e: React.MouseEvent, row: number, col: number) => {
    e.preventDefault()
    if (gameState === 'won' || gameState === 'lost') return
    if (board[row][col].isRevealed) return

    const newBoard = board.map(r => r.map(c => ({ ...c })))
    newBoard[row][col].isFlagged = !newBoard[row][col].isFlagged
    if (newBoard[row][col].isFlagged) {
      minesweeperSounds.flag()
    } else {
      minesweeperSounds.unflag()
    }
    setBoard(newBoard)
    setFlagCount(prev => newBoard[row][col].isFlagged ? prev + 1 : prev - 1)
  }

  const resetGame = () => {
    setBoard(createEmptyBoard(rows, cols))
    setGameState('waiting')
    setFlagCount(0)
    setTime(0)
    setFirstClick(true)
  }

  const getCellColor = (cell: CellState) => {
    if (!cell.isRevealed) return 'bg-gray-300 hover:bg-gray-200'
    if (cell.isMine) return 'bg-red-600'
    return 'bg-gray-100'
  }

  const getNumberColor = (num: number) => {
    const colors = [
      '',
      'text-blue-600',
      'text-green-600',
      'text-red-600',
      'text-purple-700',
      'text-amber-600',
      'text-cyan-600',
      'text-pink-600',
      'text-gray-700',
    ]
    return colors[num] || ''
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900 pb-8 px-4" style={{ paddingTop: '50px' }}>
      <div className="max-w-4xl mx-auto">
        {/* Game Controls */}
        <div className="flex flex-wrap items-center justify-center gap-4 mb-6">
          {/* Difficulty Selector */}
          <div className="flex gap-2">
            {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
                  difficulty === d
                    ? 'bg-emerald-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>

          {/* Stats */}
          <div className="flex gap-4">
            <div className="bg-gray-800/50 px-4 py-2 rounded-lg flex items-center gap-2">
              <span className="text-red-400">💣</span>
              <span className="text-white font-mono">{mines - flagCount}</span>
            </div>
            <div className="bg-gray-800/50 px-4 py-2 rounded-lg flex items-center gap-2">
              <span className="text-yellow-400">⏱️</span>
              <span className="text-white font-mono">{formatTime(time)}</span>
            </div>
          </div>

          {/* Reset Button */}
          <button
            onClick={resetGame}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-white transition-colors"
          >
            New Game
          </button>
        </div>

        {/* Game Status */}
        {(gameState === 'won' || gameState === 'lost') && (
          <div className={`text-center mb-4 py-3 rounded-lg ${
            gameState === 'won' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}>
            <span className="text-2xl font-bold">
              {gameState === 'won' ? '🎉 You Won!' : '💥 Game Over!'}
            </span>
            {gameState === 'won' && (
              <span className="ml-4 text-lg">Time: {formatTime(time)}</span>
            )}
          </div>
        )}

        {/* Game Board */}
        <div className="flex justify-center overflow-x-auto pb-4">
          <div 
            className="inline-grid gap-[2px] bg-gray-800 p-2 rounded-xl"
            style={{ 
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            }}
          >
            {board.map((row, rowIndex) =>
              row.map((cell, colIndex) => (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  onClick={() => handleCellClick(rowIndex, colIndex)}
                  onContextMenu={(e) => handleRightClick(e, rowIndex, colIndex)}
                  disabled={gameState === 'won' || gameState === 'lost'}
                  className={`
                    w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center text-xs sm:text-sm font-bold
                    rounded-sm transition-colors select-none
                    ${getCellColor(cell)}
                    ${!cell.isRevealed && !cell.isFlagged ? 'cursor-pointer' : ''}
                    ${cell.isFlagged ? 'bg-amber-400' : ''}
                  `}
                >
                  {cell.isFlagged && !cell.isRevealed && '🚩'}
                  {cell.isRevealed && cell.isMine && '💣'}
                  {cell.isRevealed && !cell.isMine && cell.adjacentMines > 0 && (
                    <span className={getNumberColor(cell.adjacentMines)}>
                      {cell.adjacentMines}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-6 text-center text-gray-500 text-sm">
          <p>Left click to reveal • Right click to flag</p>
        </div>

        {/* Back Link */}
        <div className="mt-8 text-center">
          <Link
            href="/game"
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            ← Back to Games
          </Link>
        </div>
      </div>
    </div>
  )
}
