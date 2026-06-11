/**
 * Sync voice-call ringtones from /Ringtones into app assets.
 *
 * Source (user-provided):
 *   Ringtones/Incoming ringtone 1.mp3
 *   Ringtones/Outgoing ringtone 1.mp3
 *
 * Outputs:
 *   public/sounds/incoming-ring.wav  — web + service worker cache
 *   public/sounds/outgoing-ring.wav
 *   ios/App/App/incoming-ring.wav    — CallKit lock-screen ring
 *
 * Run: node scripts/sync-call-rings.js
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const ringtonesDir = path.join(root, 'Ringtones')
const soundsDir = path.join(root, 'public', 'sounds')
const iosRingPath = path.join(root, 'ios', 'App', 'App', 'incoming-ring.wav')

const SOURCES = {
  incoming: path.join(ringtonesDir, 'Incoming ringtone 1.mp3'),
  outgoing: path.join(ringtonesDir, 'Outgoing ringtone 1.mp3'),
}

const OUTPUTS = {
  incoming: path.join(soundsDir, 'incoming-ring.wav'),
  outgoing: path.join(soundsDir, 'outgoing-ring.wav'),
}

function resolveFfmpeg() {
  try {
    return require('ffmpeg-static')
  } catch {
    const found = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' })
    if (found.status === 0) return 'ffmpeg'
    return null
  }
}

function convertToWav(ffmpeg, inputPath, outputPath) {
  const result = spawnSync(
    ffmpeg,
    ['-y', '-i', inputPath, '-ar', '44100', '-ac', '1', '-c:a', 'pcm_s16le', outputPath],
    { encoding: 'utf8' },
  )
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(`ffmpeg failed for ${inputPath}: ${detail}`)
  }
}

function main() {
  const ffmpeg = resolveFfmpeg()
  if (!ffmpeg) {
    console.error('[sync-call-rings] ffmpeg not found (install ffmpeg-static or system ffmpeg)')
    process.exit(1)
  }

  for (const kind of ['incoming', 'outgoing']) {
    const source = SOURCES[kind]
    if (!fs.existsSync(source)) {
      console.error(`[sync-call-rings] missing source: ${source}`)
      process.exit(1)
    }
  }

  fs.mkdirSync(soundsDir, { recursive: true })

  for (const kind of ['incoming', 'outgoing']) {
    convertToWav(ffmpeg, SOURCES[kind], OUTPUTS[kind])
    const sizeKb = (fs.statSync(OUTPUTS[kind]).size / 1024).toFixed(1)
    console.log(`[sync-call-rings] wrote ${OUTPUTS[kind]} (${sizeKb} KB)`)
  }

  fs.copyFileSync(OUTPUTS.incoming, iosRingPath)
  const iosKb = (fs.statSync(iosRingPath).size / 1024).toFixed(1)
  console.log(`[sync-call-rings] copied incoming ring to ${iosRingPath} (${iosKb} KB)`)

  require('./update-ring-cache-version').main()
}

main()
