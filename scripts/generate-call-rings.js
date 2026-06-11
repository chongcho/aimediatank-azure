/**
 * Generate incoming/outgoing call ring WAV files (classic analog PSTN dual-tone).
 * Run: node scripts/generate-call-rings.js
 */
const fs = require('fs')
const path = require('path')

const SAMPLE_RATE = 44100
const VOLUME = 0.42

/** North American analog ring: 440 Hz + 480 Hz dual-tone. */
const RING_TONE_A = 440
const RING_TONE_B = 480

function envelopeAt(sampleIndex, totalSamples) {
  const attack = Math.floor(SAMPLE_RATE * 0.02)
  const release = Math.floor(SAMPLE_RATE * 0.025)
  if (sampleIndex < attack) return sampleIndex / attack
  if (sampleIndex > totalSamples - release) {
    return Math.max(0, (totalSamples - sampleIndex) / release)
  }
  return 1
}

function dualToneSample(globalSampleIndex, volume, env) {
  const t = globalSampleIndex / SAMPLE_RATE
  const wave =
    (Math.sin(2 * Math.PI * RING_TONE_A * t) + Math.sin(2 * Math.PI * RING_TONE_B * t)) * 0.5
  return wave * volume * env
}

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
      if (segment.type === 'ring') {
        sample = dualToneSample(offset + i, VOLUME, envelopeAt(i, count))
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

// Classic US landline: ~2 s dual-tone warble, ~4 s silence (6 s loop).
writeWav(
  [
    { type: 'ring', ms: 2000 },
    { type: 'silence', ms: 4000 },
  ],
  path.join(soundsDir, 'incoming-ring.wav'),
)

// Ringback heard by caller while the other phone rings (same PSTN dual-tone cadence).
writeWav(
  [
    { type: 'ring', ms: 2000 },
    { type: 'silence', ms: 4000 },
  ],
  path.join(soundsDir, 'outgoing-ring.wav'),
)

writeWav([{ type: 'silence', ms: 100 }], path.join(soundsDir, 'silent.wav'))

require('./update-ring-cache-version').main()
