#!/usr/bin/env node
/**
 * Patch @kapsula-chat/capacitor-push-calls Android FCM router for AiMediaTank cancel pushes.
 */
const fs = require('fs')
const path = require('path')

const pluginPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@kapsula-chat',
  'capacitor-push-calls',
  'android',
  'src',
  'main',
  'java',
  'com',
  'capacitor',
  'voipcalls',
  'CapacitorVoipCallsPlugin.kt',
)

if (!fs.existsSync(pluginPath)) {
  console.warn('[patch-android-fcm] CapacitorVoipCallsPlugin.kt not found; skip')
  process.exit(0)
}

let source = fs.readFileSync(pluginPath, 'utf8')
const marker = 'AiMediaTank FCM cancel push'

if (source.includes(marker)) {
  console.log('[patch-android-fcm] already patched')
  process.exit(0)
}

const anchor = 'fun routeRemoteMessage(context: Context, data: Map<String, String>, title: String?, body: String?) {'
const insert = `${anchor}
            // ${marker}
            if (data["action"]?.lowercase() == "cancel") {
                val cancelCallId = data["callId"] ?: return
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val manager = CallManager(context)
                    manager.endCall(cancelCallId)
                    manager.rejectCall(cancelCallId)
                }
                val ended = JSObject().apply { put("callId", cancelCallId) }
                emitFromService("callEnded", ended)
                return
            }
`

if (!source.includes(anchor)) {
  console.warn('[patch-android-fcm] routeRemoteMessage anchor not found; skip')
  process.exit(0)
}

source = source.replace(anchor, insert)
fs.writeFileSync(pluginPath, source)
console.log('[patch-android-fcm] added FCM cancel routing')
