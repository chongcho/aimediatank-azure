#!/usr/bin/env node
/**
 * Patch @kapsula-chat/capacitor-push-calls Android for AiMediaTank voice calls.
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
let changed = false

const cancelMarker = 'AiMediaTank FCM cancel push'
if (!source.includes(cancelMarker)) {
  const cancelAnchor =
    'fun routeRemoteMessage(context: Context, data: Map<String, String>, title: String?, body: String?) {'
  const cancelInsert = `${cancelAnchor}
            // ${cancelMarker}
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
  if (source.includes(cancelAnchor)) {
    source = source.replace(cancelAnchor, cancelInsert)
    changed = true
    console.log('[patch-android-fcm] added FCM cancel routing')
  } else {
    console.warn('[patch-android-fcm] routeRemoteMessage anchor not found; skip cancel patch')
  }
}

const registerMarker = 'AiMediaTank register phone account'
if (!source.includes(registerMarker)) {
  const registerAnchor = `.addOnSuccessListener { token ->
                emitEvent("registration", JSObject().apply { put("value", token) })`
  const registerInsert = `.addOnSuccessListener { token ->
                // ${registerMarker}
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    try {
                        VoipConnectionService.registerPhoneAccount(context)
                    } catch (_: Exception) {
                    }
                }
                emitEvent("registration", JSObject().apply { put("value", token) })`
  if (source.includes(registerAnchor)) {
    source = source.replace(registerAnchor, registerInsert)
    changed = true
    console.log('[patch-android-fcm] register() now ensures phone account')
  } else {
    console.warn('[patch-android-fcm] register() anchor not found; skip register patch')
  }
}

if (changed) {
  fs.writeFileSync(pluginPath, source)
} else {
  console.log('[patch-android-fcm] already patched')
}
