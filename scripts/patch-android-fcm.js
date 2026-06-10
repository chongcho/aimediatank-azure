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
const incomingCallUiPath = path.join(pluginDir, 'IncomingCallUiHelper.kt')

const incomingCallUiSource = `package com.capacitor.voipcalls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.util.Log

/** Brings AiMediaTank call UI over lock screen when ConnectionService UI is suppressed (Samsung, etc.). */
object IncomingCallUiHelper {
    private const val TAG = "IncomingCallUi"
    private const val CHANNEL_ID = "aimediatank_incoming_voice_call"
    private const val NOTIFICATION_ID = 91001

    fun present(context: Context, callId: String, displayName: String) {
        boostRingVolume(context)
        ensureNotificationChannel(context)
        launchMainActivity(context, callId)
        showFullScreenNotification(context, callId, displayName)
    }

    fun dismiss(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIFICATION_ID)
    }

    // AiMediaTank boost ring volume
    private fun boostRingVolume(context: Context) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        try {
            am.mode = AudioManager.MODE_RINGTONE
            val maxRing = am.getStreamMaxVolume(AudioManager.STREAM_RING)
            if (maxRing > 0) {
                am.setStreamVolume(AudioManager.STREAM_RING, maxRing, 0)
            }
            val maxMedia = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val targetMedia = kotlin.math.ceil(maxMedia * 0.9f).toInt()
            if (maxMedia > 0 && am.getStreamVolume(AudioManager.STREAM_MUSIC) < targetMedia) {
                am.setStreamVolume(AudioManager.STREAM_MUSIC, targetMedia, 0)
            }
        } catch (e: Exception) {
            Log.w(TAG, "boostRingVolume failed", e)
        }
    }

    private fun incomingCallUri(callId: String): Uri =
        Uri.parse(
            "https://aimediatank.com/?openChat=1&voiceIncoming=1&callId=" +
                Uri.encode(callId)
        )

    private fun buildMainActivityIntent(context: Context, callId: String): Intent =
        Intent().apply {
            setClassName(context.packageName, "com.aimediatank.app.MainActivity")
            action = Intent.ACTION_VIEW
            data = incomingCallUri(callId)
            addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            )
        }

    private fun launchMainActivity(context: Context, callId: String) {
        try {
            context.startActivity(buildMainActivityIntent(context, callId))
        } catch (e: Exception) {
            Log.e(TAG, "startActivity failed for call \$callId", e)
        }
    }

    private fun ensureNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Incoming voice calls",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "AiMediaTank incoming voice call alerts"
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setBypassDnd(true)
        }
        nm.createNotificationChannel(channel)
    }

    private fun showFullScreenNotification(context: Context, callId: String, displayName: String) {
        val contentIntent = buildMainActivityIntent(context, callId)
        val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
        val fullScreenPending = PendingIntent.getActivity(
            context,
            callId.hashCode(),
            contentIntent,
            pendingFlags
        )
        val contentPending = PendingIntent.getActivity(
            context,
            callId.hashCode() + 1,
            contentIntent,
            pendingFlags
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(context, CHANNEL_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(context)
        }

        builder
            .setSmallIcon(context.applicationInfo.icon)
            .setContentTitle("Incoming call")
            .setContentText(displayName)
            .setCategory(Notification.CATEGORY_CALL)
            .setPriority(Notification.PRIORITY_MAX)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(contentPending)
            .setFullScreenIntent(fullScreenPending, true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder.setVisibility(Notification.VISIBILITY_PUBLIC)
        }

        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.notify(NOTIFICATION_ID, builder.build())
    }
}
`

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

if (!fs.existsSync(incomingCallUiPath) || !fs.readFileSync(incomingCallUiPath, 'utf8').includes('IncomingCallUiHelper')) {
  fs.writeFileSync(incomingCallUiPath, incomingCallUiSource)
  changed = true
  console.log('[patch-android-fcm] added IncomingCallUiHelper.kt')
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
                IncomingCallUiHelper.dismiss(context)
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

const callUiMarker = 'AiMediaTank present incoming call UI'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (!callManager.includes(callUiMarker)) {
    const cmPresentAnchor = `            eventEmitter?.invoke("incomingCall", data)
        } catch (e: SecurityException) {`
    const cmPresentInsert = `            eventEmitter?.invoke("incomingCall", data)
            // ${callUiMarker}
            IncomingCallUiHelper.present(context, callId, displayName)
            FcmDeviceAck.report(callId, "connection_service_reported")
        } catch (e: SecurityException) {`
    if (callManager.includes(cmPresentAnchor)) {
      callManager = callManager.replace(cmPresentAnchor, cmPresentInsert)
      fs.writeFileSync(callManagerPath, callManager)
      changed = true
      console.log('[patch-android-fcm] CallManager launches lock-screen call UI')
    }
  }

  const cmFallbackMarker = 'connection_service_failed'
  if (callManager.includes(callUiMarker) && !callManager.includes(cmFallbackMarker)) {
    callManager = callManager.replace(
      `            notifyError("Failed to report incoming call: \${e.message}")
        } catch (e: Exception) {
            android.util.Log.e("CallManager", "addNewIncomingCall failed: \${e.message}", e)
            notifyError("Failed to report incoming call: \${e.message}")`,
      `            IncomingCallUiHelper.present(context, callId, displayName)
            FcmDeviceAck.report(callId, "connection_service_failed", e.message)
            notifyError("Failed to report incoming call: \${e.message}")
        } catch (e: Exception) {
            android.util.Log.e("CallManager", "addNewIncomingCall failed: \${e.message}", e)
            IncomingCallUiHelper.present(context, callId, displayName)
            FcmDeviceAck.report(callId, "connection_service_failed", e.message)
            notifyError("Failed to report incoming call: \${e.message}")`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager fallback UI on ConnectionService failure')
  }
}

if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  const dismissMarker = 'IncomingCallUiHelper.dismiss(context)'
  if (pluginSource.includes('AiMediaTank FCM cancel push') && !pluginSource.includes(dismissMarker)) {
    pluginSource = pluginSource.replace(
      'emitFromService("callEnded", ended)\n                return',
      'emitFromService("callEnded", ended)\n                IncomingCallUiHelper.dismiss(context)\n                return',
    )
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] FCM cancel dismisses incoming call notification')
  }
}

const voipUiHelperMarker = 'IncomingCallUiHelper.present'
if (fs.existsSync(voipConnectionPath)) {
  let voipConnection = fs.readFileSync(voipConnectionPath, 'utf8')
  if (voipConnection.includes('AiMediaTank launch MainActivity on incoming call') && !voipConnection.includes(voipUiHelperMarker)) {
    const voipReplaceFrom = `    override fun onShowIncomingCallUi() {
        // AiMediaTank launch MainActivity on incoming call
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
    const voipReplaceTo = `    override fun onShowIncomingCallUi() {
        IncomingCallUiHelper.present(context, callId, displayName)
    }`
    if (voipConnection.includes(voipReplaceFrom)) {
      voipConnection = voipConnection.replace(voipReplaceFrom, voipReplaceTo)
      fs.writeFileSync(voipConnectionPath, voipConnection)
      changed = true
      console.log('[patch-android-fcm] VoipConnection uses IncomingCallUiHelper')
    }
  }
}

const ringVolumeMarker = 'AiMediaTank boost ring volume'
if (fs.existsSync(incomingCallUiPath)) {
  let helper = fs.readFileSync(incomingCallUiPath, 'utf8')
  if (helper.includes('IncomingCallUiHelper') && !helper.includes(ringVolumeMarker)) {
    if (!helper.includes('import android.media.AudioManager')) {
      helper = helper.replace(
        'import android.content.Intent',
        'import android.content.Intent\nimport android.media.AudioManager',
      )
    }
    helper = helper.replace(
      '    fun present(context: Context, callId: String, displayName: String) {\n        ensureNotificationChannel(context)',
      '    fun present(context: Context, callId: String, displayName: String) {\n        boostRingVolume(context)\n        ensureNotificationChannel(context)',
    )
    const boostFn = `
    // ${ringVolumeMarker}
    private fun boostRingVolume(context: Context) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        try {
            am.mode = AudioManager.MODE_RINGTONE
            val maxRing = am.getStreamMaxVolume(AudioManager.STREAM_RING)
            if (maxRing > 0) {
                am.setStreamVolume(AudioManager.STREAM_RING, maxRing, 0)
            }
            val maxMedia = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
            val targetMedia = kotlin.math.ceil(maxMedia * 0.9f).toInt()
            if (maxMedia > 0 && am.getStreamVolume(AudioManager.STREAM_MUSIC) < targetMedia) {
                am.setStreamVolume(AudioManager.STREAM_MUSIC, targetMedia, 0)
            }
        } catch (e: Exception) {
            Log.w(TAG, "boostRingVolume failed", e)
        }
    }
`
    helper = helper.replace(
      '    private fun incomingCallUri(callId: String): Uri =',
      `${boostFn}\n    private fun incomingCallUri(callId: String): Uri =`,
    )
    fs.writeFileSync(incomingCallUiPath, helper)
    changed = true
    console.log('[patch-android-fcm] IncomingCallUiHelper boosts ring volume')
  }
}

if (!changed) {
  console.log('[patch-android-fcm] already patched')
}
