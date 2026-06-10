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
const voipConnectionPath = path.join(pluginDir, 'VoipConnection.kt')
const messagingServicePath = path.join(pluginDir, 'PushRouterMessagingService.kt')
const fcmDeviceAckPath = path.join(pluginDir, 'FcmDeviceAck.kt')

const fcmDeviceAckSource = `package com.capacitor.voipcalls

import android.util.Log
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** Reports FCM delivery to server for lock-screen call debugging. */
object FcmDeviceAck {
    private const val ACK_URL = "https://aimediatank.com/api/chat/voice/push-ack"
    private val executor = Executors.newSingleThreadExecutor()

    fun report(callId: String?, event: String, detail: String? = null) {
        if (callId.isNullOrBlank()) return
        executor.execute {
            try {
                val conn = (URL(ACK_URL).openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    setRequestProperty("Content-Type", "application/json")
                    doOutput = true
                    connectTimeout = 8000
                    readTimeout = 8000
                }
                val body = JSONObject().apply {
                    put("callId", callId)
                    put("event", event)
                    if (!detail.isNullOrBlank()) put("detail", detail)
                }
                conn.outputStream.use { stream ->
                    stream.write(body.toString().toByteArray(Charsets.UTF_8))
                }
                conn.inputStream.close()
                conn.disconnect()
            } catch (e: Exception) {
                Log.w("FcmDeviceAck", "ack failed for $callId/$event: \${e.message}")
            }
        }
    }
}
`

if (!fs.existsSync(pluginPath)) {
  console.warn('[patch-android-fcm] CapacitorVoipCallsPlugin.kt not found; skip')
  process.exit(0)
}

let changed = false

if (!fs.existsSync(fcmDeviceAckPath) || !fs.readFileSync(fcmDeviceAckPath, 'utf8').includes('FcmDeviceAck')) {
  fs.writeFileSync(fcmDeviceAckPath, fcmDeviceAckSource)
  changed = true
  console.log('[patch-android-fcm] added FcmDeviceAck.kt')
}

let source = fs.readFileSync(pluginPath, 'utf8')

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
                val handle = data["handle"] ?: return`
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
                FcmDeviceAck.report(callId, "fcm_received")
                val handle = data["handle"] ?: return`
  if (source.includes(callRouteAnchor)) {
    const restAnchor = `                val handle = data["handle"] ?: return
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
    const restInsert = `                val handle = data["handle"] ?: return
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
                    FcmDeviceAck.report(callId, "connection_service_reported")
                } catch (e: Exception) {
                    android.util.Log.e("CapacitorPushCalls", "reportIncomingCall failed for $callId", e)
                    FcmDeviceAck.report(callId, "connection_service_failed", e.message)
                }
                return
            }`
    source = source.replace(callRouteAnchor, callRouteInsert)
    source = source.replace(restAnchor, restInsert)
    changed = true
    console.log('[patch-android-fcm] hardened FCM incoming call route')
  }
} else if (!source.includes('FcmDeviceAck.report(callId, "fcm_received")')) {
  source = source.replace(
    'val callId = data["callId"] ?: UUID.randomUUID().toString()\n                val handle = data["handle"] ?: return',
    'val callId = data["callId"] ?: UUID.randomUUID().toString()\n                FcmDeviceAck.report(callId, "fcm_received")\n                val handle = data["handle"] ?: return',
  )
  changed = true
  console.log('[patch-android-fcm] added FCM device ack reporting')
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

const voipUiMarker = 'AiMediaTank launch MainActivity on incoming call'
if (fs.existsSync(voipConnectionPath)) {
  let voipConnection = fs.readFileSync(voipConnectionPath, 'utf8')
  if (!voipConnection.includes(voipUiMarker)) {
    const voipAnchor = `    override fun onShowIncomingCallUi() {
        val uri = Uri.Builder()
            .scheme("chat.kapsula.quick")
            .authority("call")
            .appendQueryParameter("callId", callId)
            .appendQueryParameter("incoming", "1")
            .appendQueryParameter("handle", handle)
            .appendQueryParameter("displayName", displayName)
            .build()
        val launchIntent = Intent(Intent.ACTION_VIEW, uri).apply {
            setPackage(context.packageName)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        try {
            // On some OEM/Android builds fullScreenIntent is suppressed for self-managed calls.
            // Launch the app activity directly as a fallback.
            context.startActivity(launchIntent)
        } catch (_: Exception) {
        }
    }`
    const voipInsert = `    override fun onShowIncomingCallUi() {
        // ${voipUiMarker}
        val launchIntent = Intent().apply {
            setClassName(context.packageName, "com.aimediatank.app.MainActivity")
            action = Intent.ACTION_VIEW
            data = Uri.parse(
                "https://aimediatank.com/?openChat=1&voiceIncoming=1&callId=" +
                    Uri.encode(callId)
            )
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        try {
            context.startActivity(launchIntent)
        } catch (e: Exception) {
            android.util.Log.e("VoipConnection", "startActivity failed for incoming call UI", e)
        }
    }`
    if (voipConnection.includes(voipAnchor)) {
      voipConnection = voipConnection.replace(voipAnchor, voipInsert)
      fs.writeFileSync(voipConnectionPath, voipConnection)
      changed = true
      console.log('[patch-android-fcm] VoipConnection launches MainActivity')
    }
  }
}

const fcmWakeMarker = 'AiMediaTank FCM wake lock'
if (fs.existsSync(messagingServicePath)) {
  let messaging = fs.readFileSync(messagingServicePath, 'utf8')
  if (!messaging.includes(fcmWakeMarker)) {
    const msgAnchor = `class PushRouterMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        CapacitorVoipCallsPlugin.emitFromService(
            "registration",
            JSObject().apply { put("value", token) }
        )
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        CapacitorVoipCallsPlugin.routeRemoteMessage(
            context = applicationContext,
            data = message.data,
            title = message.notification?.title,
            body = message.notification?.body
        )
    }
}`
    const msgInsert = `class PushRouterMessagingService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        CapacitorVoipCallsPlugin.emitFromService(
            "registration",
            JSObject().apply { put("value", token) }
        )
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        // ${fcmWakeMarker}
        val powerManager = getSystemService(POWER_SERVICE) as android.os.PowerManager
        val wakeLock = powerManager.newWakeLock(
            android.os.PowerManager.PARTIAL_WAKE_LOCK,
            "AiMediaTank:IncomingCallFCM"
        )
        wakeLock.acquire(60000)
        try {
            CapacitorVoipCallsPlugin.routeRemoteMessage(
                context = applicationContext,
                data = message.data,
                title = message.notification?.title,
                body = message.notification?.body
            )
        } finally {
            if (wakeLock.isHeld) wakeLock.release()
        }
    }
}`
    if (messaging.includes(msgAnchor)) {
      messaging = messaging.replace(msgAnchor, msgInsert)
      if (!messaging.includes('import android.content.Context')) {
        messaging = messaging.replace(
          'import com.getcapacitor.JSObject',
          'import com.getcapacitor.JSObject\nimport android.content.Context',
        )
      }
      fs.writeFileSync(messagingServicePath, messaging)
      changed = true
      console.log('[patch-android-fcm] PushRouterMessagingService wake lock')
    }
  }
}

if (!changed) {
  console.log('[patch-android-fcm] already patched')
}
