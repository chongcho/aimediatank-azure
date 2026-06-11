/**
 * Generate native app icons from public/logo.png.
 * Run: node scripts/generate-app-icons.js
 */
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const sourceLogo = path.join(root, 'public', 'logo.png')
const iosIcon = path.join(
  root,
  'ios',
  'App',
  'App',
  'Assets.xcassets',
  'AppIcon.appiconset',
  'AppIcon-512@2x.png',
)

const ANDROID_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
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

function runFfmpeg(ffmpeg, args) {
  const result = spawnSync(ffmpeg, args, { encoding: 'utf8' })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim()
    throw new Error(detail || 'ffmpeg failed')
  }
}

/** Square PNG, white background, no alpha (App Store requirement). */
function writeSquareIcon(ffmpeg, size, outputPath) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  runFfmpeg(ffmpeg, [
    '-y',
    '-i',
    sourceLogo,
    '-vf',
    `scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=white,format=rgb24`,
    outputPath,
  ])
}

function main() {
  if (!fs.existsSync(sourceLogo)) {
    console.error('[generate-app-icons] missing public/logo.png')
    process.exit(1)
  }

  const ffmpeg = resolveFfmpeg()
  if (!ffmpeg) {
    console.error('[generate-app-icons] ffmpeg not found')
    process.exit(1)
  }

  writeSquareIcon(ffmpeg, 1024, iosIcon)
  console.log('[generate-app-icons] wrote', iosIcon)

  for (const [folder, size] of Object.entries(ANDROID_SIZES)) {
    const base = path.join(root, 'android', 'app', 'src', 'main', 'res', folder)
    for (const name of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png']) {
      const out = path.join(base, name)
      writeSquareIcon(ffmpeg, size, out)
      console.log('[generate-app-icons] wrote', out)
    }
  }
}

main()
