// Game Sound Effects using Web Audio API
// Generates retro-style sounds programmatically

let audioContext: AudioContext | null = null

const getAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null
  
  if (!audioContext) {
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (e) {
      console.warn('Web Audio API not supported')
      return null
    }
  }
  return audioContext
}

// Resume audio context (needed after user interaction)
export const resumeAudio = () => {
  const ctx = getAudioContext()
  if (ctx && ctx.state === 'suspended') {
    ctx.resume()
  }
}

// Play a tone with given frequency and duration
const playTone = (frequency: number, duration: number, type: OscillatorType = 'square', volume: number = 0.3) => {
  const ctx = getAudioContext()
  if (!ctx) return

  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)

  gainNode.gain.setValueAtTime(volume, ctx.currentTime)
  gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration)

  oscillator.start(ctx.currentTime)
  oscillator.stop(ctx.currentTime + duration)
}

// Play a sequence of tones
const playSequence = (notes: { freq: number; dur: number }[], type: OscillatorType = 'square', volume: number = 0.3) => {
  const ctx = getAudioContext()
  if (!ctx) return

  let time = ctx.currentTime
  notes.forEach(({ freq, dur }) => {
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    oscillator.type = type
    oscillator.frequency.setValueAtTime(freq, time)

    gainNode.gain.setValueAtTime(volume, time)
    gainNode.gain.exponentialRampToValueAtTime(0.01, time + dur)

    oscillator.start(time)
    oscillator.stop(time + dur)

    time += dur
  })
}

// ============ TETRIS SOUNDS ============
export const tetrisSounds = {
  move: () => playTone(200, 0.05, 'square', 0.2),
  rotate: () => playTone(300, 0.08, 'square', 0.2),
  drop: () => playTone(150, 0.1, 'square', 0.3),
  lineClear: () => playSequence([
    { freq: 523, dur: 0.1 },
    { freq: 659, dur: 0.1 },
    { freq: 784, dur: 0.1 },
    { freq: 1047, dur: 0.2 },
  ], 'square', 0.3),
  tetris: () => playSequence([
    { freq: 523, dur: 0.1 },
    { freq: 659, dur: 0.1 },
    { freq: 784, dur: 0.1 },
    { freq: 1047, dur: 0.15 },
    { freq: 784, dur: 0.1 },
    { freq: 1047, dur: 0.3 },
  ], 'square', 0.4),
  gameOver: () => playSequence([
    { freq: 392, dur: 0.2 },
    { freq: 370, dur: 0.2 },
    { freq: 349, dur: 0.2 },
    { freq: 330, dur: 0.4 },
  ], 'sawtooth', 0.3),
  levelUp: () => playSequence([
    { freq: 523, dur: 0.1 },
    { freq: 659, dur: 0.1 },
    { freq: 784, dur: 0.1 },
    { freq: 1047, dur: 0.1 },
    { freq: 1319, dur: 0.2 },
  ], 'square', 0.3),
}

// ============ MINESWEEPER SOUNDS ============
export const minesweeperSounds = {
  reveal: () => playTone(400, 0.05, 'sine', 0.2),
  flag: () => playTone(600, 0.08, 'square', 0.2),
  unflag: () => playTone(400, 0.08, 'square', 0.2),
  explosion: () => {
    const ctx = getAudioContext()
    if (!ctx) return
    
    // Create noise for explosion
    const bufferSize = ctx.sampleRate * 0.3
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const output = buffer.getChannelData(0)
    
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2)
    }
    
    const noise = ctx.createBufferSource()
    const gainNode = ctx.createGain()
    noise.buffer = buffer
    noise.connect(gainNode)
    gainNode.connect(ctx.destination)
    gainNode.gain.setValueAtTime(0.4, ctx.currentTime)
    noise.start()
  },
  win: () => playSequence([
    { freq: 523, dur: 0.15 },
    { freq: 659, dur: 0.15 },
    { freq: 784, dur: 0.15 },
    { freq: 1047, dur: 0.3 },
  ], 'sine', 0.3),
}

// ============ DONKEY KONG SOUNDS ============
export const donkeyKongSounds = {
  jump: () => playSequence([
    { freq: 200, dur: 0.05 },
    { freq: 400, dur: 0.1 },
  ], 'square', 0.3),
  land: () => playTone(100, 0.05, 'square', 0.2),
  points: () => playTone(800, 0.1, 'square', 0.2),
  death: () => playSequence([
    { freq: 400, dur: 0.1 },
    { freq: 300, dur: 0.1 },
    { freq: 200, dur: 0.1 },
    { freq: 100, dur: 0.3 },
  ], 'sawtooth', 0.3),
  levelComplete: () => playSequence([
    { freq: 523, dur: 0.1 },
    { freq: 659, dur: 0.1 },
    { freq: 784, dur: 0.1 },
    { freq: 1047, dur: 0.2 },
    { freq: 1319, dur: 0.3 },
  ], 'square', 0.3),
  barrelSpawn: () => playTone(150, 0.1, 'square', 0.15),
}

// ============ PAC-MAN SOUNDS ============
export const pacmanSounds = {
  waka: () => playTone(440, 0.05, 'square', 0.15),
  powerPellet: () => playSequence([
    { freq: 200, dur: 0.1 },
    { freq: 400, dur: 0.1 },
    { freq: 600, dur: 0.1 },
    { freq: 800, dur: 0.15 },
  ], 'square', 0.3),
  eatGhost: () => playSequence([
    { freq: 300, dur: 0.05 },
    { freq: 600, dur: 0.05 },
    { freq: 900, dur: 0.05 },
    { freq: 1200, dur: 0.1 },
  ], 'square', 0.3),
  death: () => playSequence([
    { freq: 500, dur: 0.1 },
    { freq: 450, dur: 0.1 },
    { freq: 400, dur: 0.1 },
    { freq: 350, dur: 0.1 },
    { freq: 300, dur: 0.1 },
    { freq: 250, dur: 0.1 },
    { freq: 200, dur: 0.2 },
  ], 'sine', 0.3),
  win: () => playSequence([
    { freq: 523, dur: 0.1 },
    { freq: 659, dur: 0.1 },
    { freq: 784, dur: 0.1 },
    { freq: 1047, dur: 0.15 },
    { freq: 784, dur: 0.1 },
    { freq: 1047, dur: 0.3 },
  ], 'sine', 0.3),
  start: () => playSequence([
    { freq: 262, dur: 0.15 },
    { freq: 330, dur: 0.15 },
    { freq: 392, dur: 0.15 },
    { freq: 523, dur: 0.3 },
  ], 'square', 0.3),
}

// Generic game sounds
export const gameSounds = {
  click: () => playTone(500, 0.05, 'square', 0.2),
  start: () => playSequence([
    { freq: 262, dur: 0.1 },
    { freq: 330, dur: 0.1 },
    { freq: 392, dur: 0.1 },
    { freq: 523, dur: 0.2 },
  ], 'square', 0.3),
}
