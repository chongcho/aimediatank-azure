#!/usr/bin/env node
/**
 * Patch @kapsula-chat/capacitor-push-calls Android for AiMediaTank voice calls.
 */
const fs = require('fs')
const path = require('path')

const pluginDir = path.join(
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
)

const pluginPath = path.join(pluginDir, 'CapacitorVoipCallsPlugin.kt')
const callManagerPath = path.join(pluginDir, 'CallManager.kt')

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

const callRouteMarker = 'AiMediaTank FCM incoming call route'
if (!source.includes(callRouteMarker)) {
  const callRouteAnchor = `            if (type == TYPE_CALL) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                    return
                }

                try {
                    VoipConnectionService.registerPhoneAccount(context)
                } catch (_: SecurityException) {
                }

                val callId = data["callId"] ?: UUID.randomUUID().toString()
                val handle = data["handle"] ?: return
                val displayName = data["displayName"] ?: handle
                val handleType = data["handleType"] ?: "generic"
                val video = parseBoolean(data["video"])

                val metadata = JSObject()
                for ((key, value) in data) {
                    if (key in setOf("type", "callId", "handle", "displayName", "handleType", "video")) {
                        continue
                    }
                    metadata.put(key, value)
                }

                val manager = CallManager(context)
                manager.reportIncomingCall(
                    callId = callId,
                    handle = handle,
                    displayName = displayName,
                    handleType = handleType,
                    video = video,
                    metadata = if (metadata.length() > 0) metadata else null
                )
                return
            }`
  const callRouteInsert = `            if (type == TYPE_CALL) {
                // ${callRouteMarker}
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                    android.util.Log.w("CapacitorPushCalls", "Self-managed incoming call requires API 26+")
                    return
                }

                try {
                    VoipConnectionService.registerPhoneAccount(context)
                } catch (e: Exception) {
                    android.util.Log.w("CapacitorPushCalls", "registerPhoneAccount before incoming call failed", e)
                }

                val callId = data["callId"] ?: UUID.randomUUID().toString()
                val handle = data["handle"] ?: return
                val displayName = data["displayName"] ?: handle
                val handleType = data["handleType"] ?: "generic"
                val video = parseBoolean(data["video"])

                val metadata = JSObject()
                for ((key, value) in data) {
                    if (key in setOf("type", "callId", "handle", "displayName", "handleType", "video")) {
                        continue
                    }
                    metadata.put(key, value)
                }

                try {
                    val manager = CallManager(context)
                    manager.reportIncomingCall(
                        callId = callId,
                        handle = handle,
                        displayName = displayName,
                        handleType = handleType,
                        video = video,
                        metadata = if (metadata.length() > 0) metadata else null
                    )
                } catch (e: Exception) {
                    android.util.Log.e("CapacitorPushCalls", "reportIncomingCall failed for $callId", e)
                }
                return
            }`
  if (source.includes(callRouteAnchor)) {
    source = source.replace(callRouteAnchor, callRouteInsert)
    changed = true
    console.log('[patch-android-fcm] hardened FCM incoming call route')
  } else {
    console.warn('[patch-android-fcm] incoming call anchor not found; skip call route patch')
  }
}

if (changed) {
  fs.writeFileSync(pluginPath, source)
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  const cmMarker = 'AiMediaTank log incoming call failure'
  if (!callManager.includes(cmMarker)) {
    const cmAnchor = `        } catch (e: SecurityException) {
            notifyError("Failed to report incoming call: \${e.message}")
        }`
    const cmInsert = `        } catch (e: SecurityException) {
            // ${cmMarker}
            android.util.Log.e("CallManager", "addNewIncomingCall SecurityException: \${e.message}", e)
            notifyError("Failed to report incoming call: \${e.message}")
        } catch (e: Exception) {
            android.util.Log.e("CallManager", "addNewIncomingCall failed: \${e.message}", e)
            notifyError("Failed to report incoming call: \${e.message}")
        }`
    if (callManager.includes(cmAnchor)) {
      callManager = callManager.replace(cmAnchor, cmInsert)
      fs.writeFileSync(callManagerPath, callManager)
      changed = true
      console.log('[patch-android-fcm] CallManager logs incoming call failures')
    }
  }
}

if (!changed) {
  console.log('[patch-android-fcm] already patched')
}
