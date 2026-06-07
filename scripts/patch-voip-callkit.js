#!/usr/bin/env node
/**
 * Configure CallKit custom incoming ringtone in @kapsula-chat/capacitor-push-calls.
 * Run on postinstall and in iOS CI after pod install.
 */
const fs = require('fs')
const path = require('path')

const callManagerPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@kapsula-chat',
  'capacitor-push-calls',
  'ios',
  'Plugin',
  'CallManager.swift',
)

if (!fs.existsSync(callManagerPath)) {
  console.warn('[patch-voip-callkit] CallManager.swift not found; skip')
  process.exit(0)
}

const marker = 'configuration.ringtoneSound = "incoming-ring.wav"'
let src = fs.readFileSync(callManagerPath, 'utf8')

if (src.includes(marker)) {
  console.log('[patch-voip-callkit] already patched')
  process.exit(0)
}

const anchor = 'configuration.includesCallsInRecents = true'
if (!src.includes(anchor)) {
  console.warn('[patch-voip-callkit] unexpected CallManager.swift layout; skip')
  process.exit(0)
}

src = src.replace(
  anchor,
  `${anchor}
        configuration.ringtoneSound = "incoming-ring.wav"`,
)

fs.writeFileSync(callManagerPath, src)
console.log('[patch-voip-callkit] set CallKit ringtoneSound to incoming-ring.wav')
