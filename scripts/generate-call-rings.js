/**
 * Generate incoming/outgoing call ring WAV files for iOS HTML audio playback.
 * Run: node scripts/generate-call-rings.js
 */
const fs = require('fs')
const path = require('path')

const SAMPLE_RATE = 44100
const VOLUME = 0.45

function writeWav(segments, outPath) {
  const numSamples = segments.reduce(
    (sum, s) => sum + Math.floor((SAMPLE_RATE * s.ms) / 1000),
    0,
  )
  const buffer = Buffer.alloc(44 + numSamples * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + numSamples * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(SAMPLE_RATE, 24)
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(numSamples * 2, 40)

  let offset = 0
  for (const segment of segments) {
    const count = Math.floor((SAMPLE_RATE * segment.ms) / 1000)
    for (let i = 0; i < count; i++) {
      let sample = 0
      if (segment.type === 'tone' && segment.hz) {
        sample = Math.sin((2 * Math.PI * segment.hz * i) / SAMPLE_RATE) * VOLUME
      }
      const intSample = Math.max(-32767, Math.min(32767, Math.round(sample * 32767)))
      buffer.writeInt16LE(intSample, 44 + (offset + i) * 2)
    }
    offset += count
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, buffer)
  console.log('Wrote', outPath, `(${(buffer.length / 1024).toFixed(1)} KB)`)
}

const soundsDir = path.join(__dirname, '..', 'public', 'sounds')

// Classic double-ring cadence (~4s loop) — incoming
writeWav(
  [
    { type: 'tone', hz: 440, ms: 400 },
    { type: 'silence', ms: 200 },
    { type: 'tone', hz: 440, ms: 400 },
    { type: 'silence', ms: 3000 },
  ],
  path.join(soundsDir, 'incoming-ring.wav'),
)

// Single ringback beep (~2.8s loop) — outgoing
writeWav(
  [
    { type: 'tone', hz: 480, ms: 450 },
    { type: 'silence', ms: 2350 },
  ],
  path.join(soundsDir, 'outgoing-ring.wav'),
)

// Tiny silent clip to unlock iOS audio on first user tap
writeWav([{ type: 'silence', ms: 100 }], path.join(soundsDir, 'silent.wav'))
