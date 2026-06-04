#!/usr/bin/env node
/** Copy DejaVu into public/fonts for local guest-download watermarking (CI does the same before build). */
const fs = require('fs')
const path = require('path')

const src = path.join(__dirname, '..', 'node_modules', 'dejavu-fonts-ttf', 'ttf', 'DejaVuSans-Bold.ttf')
const destDir = path.join(__dirname, '..', 'public', 'fonts')
const dest = path.join(destDir, 'DejaVuSans-Bold.ttf')

if (!fs.existsSync(src)) {
  console.warn('[copy-watermark-font] dejavu-fonts-ttf not installed; skip')
  process.exit(0)
}

fs.mkdirSync(destDir, { recursive: true })
fs.copyFileSync(src, dest)
console.log('[copy-watermark-font] copied to public/fonts/DejaVuSans-Bold.ttf')
