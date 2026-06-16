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
const callScreenPresentationPath = path.join(pluginDir, 'CallScreenPresentation.kt')

const incomingCallUiSource = `package com.capacitor.voipcalls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log

/** Brings AiMediaTank call UI over lock screen when ConnectionService UI is suppressed (Samsung, etc.). */
object IncomingCallUiHelper {
    private const val TAG = "IncomingCallUi"
    private const val CHANNEL_ID = "aimediatank_incoming_voice_call"
    private const val NOTIFICATION_ID = 91001

    fun present(context: Context, callId: String, displayName: String) {
        ensureNotificationChannel(context)
        launchMainActivity(context, callId)
        showFullScreenNotification(context, callId, displayName)
    }

    fun dismiss(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(NOTIFICATION_ID)
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
  if (helper.includes(ringVolumeMarker) || helper.includes('boostRingVolume(')) {
    helper = helper.replace(/\nimport android\.media\.AudioManager\r?\n/, '\n')
    helper = helper.replace(
      /\n    \/\/ AiMediaTank boost ring volume\n    private fun boostRingVolume\(context: Context\) \{[\s\S]*?\n    \}\n/,
      '\n',
    )
    helper = helper.replace(
      '    fun present(context: Context, callId: String, displayName: String) {\n        boostRingVolume(context)\n        ensureNotificationChannel(context)',
      '    fun present(context: Context, callId: String, displayName: String) {\n        ensureNotificationChannel(context)',
    )
    fs.writeFileSync(incomingCallUiPath, helper)
    changed = true
    console.log('[patch-android-fcm] IncomingCallUiHelper no longer changes system volume')
  }
}

const voiceVolumeMarker = 'AiMediaTank voice call volume'
const webViewVolumeMarker = 'AiMediaTank webview music volume stream'
const mediaVolumeKeysMarker = 'AiMediaTank webview media volume keys'
const avoidInCommunicationMarker = 'AiMediaTank avoid MODE_IN_COMMUNICATION system volume block'
const noGlobalAudioMarker = 'AiMediaTank no global AudioManager side effects'
const callActivePlaybackMarker = 'AiMediaTank voice call media playback'
const voiceCallRestoreAudioFocusMarker = 'AiMediaTank restore voice call audio focus'

function buildSetVoiceCallAudioActiveBlock() {
  return `    private fun resolveVolumeActivity(): android.app.Activity? {
        return (context as? android.app.Activity)
            ?: CapacitorVoipCallsPlugin.getInstance()?.activity
    }

    fun reapplyVolumeControlStream() {
        if (!voiceCallAudioActive && !CallVolumeState.ringActive) return
        resolveVolumeActivity()?.volumeControlStream = AudioManager.STREAM_MUSIC
    }

    fun releaseIfStale() {
        if (activeCalls.isEmpty() && !IncomingRingAudioHelper.isActive() && voiceCallAudioActive) {
            setVoiceCallAudioActive(false)
        }
    }

    fun releaseGlobalAudioSideEffects() {
        // ${noGlobalAudioMarker}
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            voiceCallFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
            voiceCallFocusRequest = null
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = false
        audioManager.isMicrophoneMute = false
        try {
            @Suppress("DEPRECATION")
            audioManager.stopBluetoothSco()
            audioManager.isBluetoothScoOn = false
        } catch (_: Exception) {
        }
        if (audioManager.mode != AudioManager.MODE_NORMAL) {
            audioManager.mode = AudioManager.MODE_NORMAL
        }
        resolveVolumeActivity()?.volumeControlStream = AudioManager.USE_DEFAULT_STREAM_TYPE
    }

    fun setVoiceCallAudioActive(active: Boolean) {
        // ${voiceVolumeMarker}
        // ${mediaVolumeKeysMarker}
        if (voiceCallAudioActive == active) {
            if (active) reapplyVolumeControlStream()
            return
        }
        voiceCallAudioActive = active
        CallVolumeState.voiceCallActive = active
        if (active) {
            // ${callActivePlaybackMarker}
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
            reapplyVolumeControlStream()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attrs = android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                val focusRequest = android.media.AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attrs)
                    .build()
                voiceCallFocusRequest = focusRequest
                audioManager.requestAudioFocus(focusRequest)
            } else {
                @Suppress("DEPRECATION")
                audioManager.requestAudioFocus(
                    null,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN
                )
            }
            return
        }
        releaseGlobalAudioSideEffects()
    }`
}
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (!callManager.includes(voiceVolumeMarker)) {
    callManager = callManager.replace(
      '    private val activeCalls = mutableMapOf<String, VoipConnection>()',
      `    private val activeCalls = mutableMapOf<String, VoipConnection>()
    private var voiceCallAudioActive = false
    private var voiceCallFocusRequest: android.media.AudioFocusRequest? = null`,
    )

    callManager = callManager.replace(
      `    fun setAudioRoute(route: String) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        
        when (route) {`,
      `    fun setAudioRoute(route: String) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        
        when (route) {`,
    )

    callManager = callManager.replace(
      `    fun endCall(callId: String) {
        activeCalls[callId]?.onDisconnect()
        activeCalls.remove(callId)
    }`,
      `    fun endCall(callId: String) {
        activeCalls[callId]?.onDisconnect()
        activeCalls.remove(callId)
        if (activeCalls.isEmpty()) {
            setVoiceCallAudioActive(false)
        }
    }`,
    )

    callManager = callManager.replace(
      `    fun answerCall(callId: String) {
        activeCalls[callId]?.onAnswer()
    }`,
      `    fun answerCall(callId: String) {
        setVoiceCallAudioActive(true)
        activeCalls[callId]?.onAnswer()
    }`,
    )

    callManager = callManager.replace(
      `    fun rejectCall(callId: String) {
        activeCalls[callId]?.onReject()
        activeCalls.remove(callId)
    }`,
      `    fun rejectCall(callId: String) {
        activeCalls[callId]?.onReject()
        activeCalls.remove(callId)
        if (activeCalls.isEmpty()) {
            setVoiceCallAudioActive(false)
        }
    }`,
    )

    callManager = callManager.replace(
      `        when (status) {
            "connecting" -> connection.setDialing()
            "connected" -> connection.setActive()
            "disconnected" -> {
                connection.setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
                connection.destroy()
                activeCalls.remove(callId)
            }
            "failed" -> {
                connection.setDisconnected(DisconnectCause(DisconnectCause.ERROR))
                connection.destroy()
                activeCalls.remove(callId)
            }
        }`,
      `        when (status) {
            "connecting" -> {
                setVoiceCallAudioActive(true)
                connection.setDialing()
            }
            "connected" -> {
                setVoiceCallAudioActive(true)
                connection.setActive()
            }
            "disconnected" -> {
                connection.setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
                connection.destroy()
                activeCalls.remove(callId)
                if (activeCalls.isEmpty()) {
                    setVoiceCallAudioActive(false)
                }
            }
            "failed" -> {
                connection.setDisconnected(DisconnectCause(DisconnectCause.ERROR))
                connection.destroy()
                activeCalls.remove(callId)
                if (activeCalls.isEmpty()) {
                    setVoiceCallAudioActive(false)
                }
            }
        }`,
    )

    callManager = callManager.replace(
      `    fun notifyCallEnded(callId: String, reason: String? = null) {
        val data = JSObject().apply {
            put("callId", callId)
            if (reason != null) {
                put("reason", reason)
            }
        }
        eventEmitter?.invoke("callEnded", data)
        activeCalls.remove(callId)
    }`,
      `    fun notifyCallEnded(callId: String, reason: String? = null) {
        val data = JSObject().apply {
            put("callId", callId)
            if (reason != null) {
                put("reason", reason)
            }
        }
        eventEmitter?.invoke("callEnded", data)
        activeCalls.remove(callId)
        if (activeCalls.isEmpty()) {
            setVoiceCallAudioActive(false)
        }
    }`,
    )

    callManager = callManager.replace(
      `    private fun notifyError(message: String) {
        android.util.Log.e("CallManager", message)
    }
}`,
      `${buildSetVoiceCallAudioActiveBlock()}

    private fun notifyError(message: String) {
        android.util.Log.e("CallManager", message)
    }
}`,
    )

    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager voice call volume keys')
  } else if (!callManager.includes(mediaVolumeKeysMarker)) {
    callManager = callManager.replace(
      /\n    fun setVoiceCallAudioActive\(active: Boolean\) \{[\s\S]*?\n    \}\n\n    private fun notifyError/,
      `\n${buildSetVoiceCallAudioActiveBlock()}\n\n    private fun notifyError`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager webview media volume keys')
  }
}

if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (!pluginSource.includes('startCallRing')) {
    pluginSource = pluginSource.replace(
      `    @PluginMethod
    fun setVoiceCallAudioActive(call: PluginCall) {
        val active = call.getBoolean("active", false) ?: false
        callManager?.setVoiceCallAudioActive(active)
        call.resolve()
    }`,
      `    @PluginMethod
    fun setVoiceCallAudioActive(call: PluginCall) {
        val active = call.getBoolean("active", false) ?: false
        callManager?.setVoiceCallAudioActive(active)
        call.resolve()
    }

    @PluginMethod
    fun startCallRing(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("Missing url parameter")
            return
        }
        IncomingRingAudioHelper.start(context, url)
        call.resolve()
    }

    @PluginMethod
    fun stopCallRing(call: PluginCall) {
        IncomingRingAudioHelper.stop(context)
        call.resolve()
    }`,
    )
    if (!pluginSource.includes('startCallRing')) {
      pluginSource = pluginSource.replace(
        `    @PluginMethod
    fun setMuted(call: PluginCall) {
        val muted = call.getBoolean("muted", false) ?: false

        callManager?.setMuted(muted)
        call.resolve()
    }`,
        `    @PluginMethod
    fun setMuted(call: PluginCall) {
        val muted = call.getBoolean("muted", false) ?: false

        callManager?.setMuted(muted)
        call.resolve()
    }

    @PluginMethod
    fun startCallRing(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("Missing url parameter")
            return
        }
        IncomingRingAudioHelper.start(context, url)
        call.resolve()
    }

    @PluginMethod
    fun stopCallRing(call: PluginCall) {
        IncomingRingAudioHelper.stop(context)
        call.resolve()
    }`,
      )
    }
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] CapacitorVoipCallsPlugin native call ring')
  } else if (
    pluginSource.includes('IncomingRingAudioHelper.start(context)') &&
    !pluginSource.includes('getString("url")')
  ) {
    pluginSource = pluginSource.replace(
      `    @PluginMethod
    fun startCallRing(call: PluginCall) {
        IncomingRingAudioHelper.start(context)
        call.resolve()
    }`,
      `    @PluginMethod
    fun startCallRing(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("Missing url parameter")
            return
        }
        IncomingRingAudioHelper.start(context, url)
        call.resolve()
    }`,
    )
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] startCallRing native media player url')
  }
}

const incomingRingVolumeMarker = 'AiMediaTank webview music volume stream (ring)'
const incomingRingVolumeMarkerV2 = 'AiMediaTank ring media volume keys v2'
const incomingRingVolumeMarkerV3 = 'AiMediaTank native media player ring'
const incomingRingAudioPath = path.join(pluginDir, 'IncomingRingAudioHelper.kt')
if (
  !fs.existsSync(incomingRingAudioPath) ||
  !fs.readFileSync(incomingRingAudioPath, 'utf8').includes(incomingRingVolumeMarkerV3)
) {
  const incomingRingAudioSource = `package com.capacitor.voipcalls

import android.app.Activity
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.util.Log

/** Native ring on STREAM_MUSIC — hardware volume keys control ring loudness. */
object IncomingRingAudioHelper {
    private const val TAG = "IncomingRingAudio"
    private var player: MediaPlayer? = null
    private var ringVolumeKeysActive = false
    private var ringVolumeLevel = 1f

    private fun resolveActivity(context: Context): Activity? {
        return CapacitorVoipCallsPlugin.getInstance()?.activity
            ?: (context as? Activity)
    }

    fun isActive(): Boolean = ringVolumeKeysActive

    fun reapply(context: Context) {
        if (!ringVolumeKeysActive) return
        resolveActivity(context)?.volumeControlStream = AudioManager.STREAM_MUSIC
    }

    fun setVolume(level: Float) {
        ringVolumeLevel = level.coerceIn(0f, 1f)
        player?.setVolume(ringVolumeLevel, ringVolumeLevel)
    }

    fun start(context: Context, url: String) {
        // ${incomingRingVolumeMarker}
        // ${incomingRingVolumeMarkerV2}
        // ${incomingRingVolumeMarkerV3}
        stop(context)
        ringVolumeKeysActive = true
        CallVolumeState.ringActive = true
        val activity = resolveActivity(context)
        activity?.volumeControlStream = AudioManager.STREAM_MUSIC
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.mode = AudioManager.MODE_NORMAL
        try {
            val attributes = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build()
            player = MediaPlayer().apply {
                setAudioAttributes(attributes)
                setDataSource(url)
                isLooping = true
                setVolume(1.0f, 1.0f)
                setOnPreparedListener { mp ->
                    try {
                        mp.setVolume(ringVolumeLevel, ringVolumeLevel)
                        mp.start()
                    } catch (e: Exception) {
                        Log.e(TAG, "start failed", e)
                    }
                }
                setOnErrorListener { _, what, extra ->
                    Log.e(TAG, "MediaPlayer error what=\$what extra=\$extra")
                    true
                }
                prepareAsync()
            }
        } catch (e: Exception) {
            Log.e(TAG, "prepare ring failed for \$url", e)
            stop(context)
        }
    }

    fun stop(context: Context) {
        player?.let { mp ->
            try {
                if (mp.isPlaying) mp.stop()
            } catch (_: Exception) {
            }
            try {
                mp.release()
            } catch (_: Exception) {
            }
        }
        player = null
        if (!ringVolumeKeysActive) return
        ringVolumeKeysActive = false
        CallVolumeState.ringActive = false
    }
}
`
  fs.writeFileSync(incomingRingAudioPath, incomingRingAudioSource)
  changed = true
  console.log('[patch-android-fcm] IncomingRingAudioHelper.kt')
}

if (fs.existsSync(incomingRingAudioPath)) {
  let ringHelper = fs.readFileSync(incomingRingAudioPath, 'utf8')
  if (!ringHelper.includes('fun setVolume(level: Float)')) {
    ringHelper = ringHelper.replace(
      '    private var ringVolumeKeysActive = false\n',
      '    private var ringVolumeKeysActive = false\n    private var ringVolumeLevel = 1f\n',
    )
    ringHelper = ringHelper.replace(
      '    fun start(context: Context, url: String) {',
      `    fun setVolume(level: Float) {
        ringVolumeLevel = level.coerceIn(0f, 1f)
        player?.setVolume(ringVolumeLevel, ringVolumeLevel)
    }

    fun start(context: Context, url: String) {`,
    )
    ringHelper = ringHelper.replace(
      '                        mp.start()',
      '                        mp.setVolume(ringVolumeLevel, ringVolumeLevel)\n                        mp.start()',
    )
    fs.writeFileSync(incomingRingAudioPath, ringHelper)
    changed = true
    console.log('[patch-android-fcm] IncomingRingAudioHelper setVolume')
  }
}

if (fs.existsSync(pluginPath)) {
  let pluginRingVol = fs.readFileSync(pluginPath, 'utf8')
  if (!pluginRingVol.includes('setCallRingVolume')) {
    pluginRingVol = pluginRingVol.replace(
      `    @PluginMethod
    fun stopCallRing(call: PluginCall) {
        IncomingRingAudioHelper.stop(context)
        call.resolve()
    }`,
      `    @PluginMethod
    fun stopCallRing(call: PluginCall) {
        IncomingRingAudioHelper.stop(context)
        call.resolve()
    }

    @PluginMethod
    fun setCallRingVolume(call: PluginCall) {
        val level = call.getFloat("level", 1f) ?: 1f
        IncomingRingAudioHelper.setVolume(level)
        call.resolve()
    }`,
    )
    fs.writeFileSync(pluginPath, pluginRingVol)
    changed = true
    console.log('[patch-android-fcm] CapacitorVoipCallsPlugin setCallRingVolume')
  }
}

const callVolumeStatePath = path.join(pluginDir, 'CallVolumeState.kt')
if (!fs.existsSync(callVolumeStatePath)) {
  fs.writeFileSync(
    callVolumeStatePath,
    `package com.capacitor.voipcalls

object CallVolumeState {
    @JvmField @Volatile var voiceCallActive: Boolean = false
    @JvmField @Volatile var ringActive: Boolean = false

    @JvmStatic
    fun shouldAdjustMediaVolume(): Boolean = voiceCallActive || ringActive
}
`,
  )
  changed = true
  console.log('[patch-android-fcm] CallVolumeState.kt')
}

if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  const resumeMarker = 'AiMediaTank reapply voice volume on resume'
  if (!pluginSource.includes(resumeMarker)) {
    pluginSource = pluginSource.replace(
      `    override fun handleOnDestroy() {
        if (pluginInstance === this) {
            pluginInstance = null
        }
        super.handleOnDestroy()
    }`,
      `    override fun handleOnResume() {
        super.handleOnResume()
        // ${resumeMarker}
        callManager?.reapplyVolumeControlStream()
        IncomingRingAudioHelper.reapply(context)
    }

    override fun handleOnDestroy() {
        if (pluginInstance === this) {
            pluginInstance = null
        }
        super.handleOnDestroy()
    }`,
    )
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] CapacitorVoipCallsPlugin handleOnResume volume')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (!callManager.includes(avoidInCommunicationMarker)) {
    callManager = callManager.replace(
      '            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION',
      `            // ${avoidInCommunicationMarker}\n            audioManager.mode = AudioManager.MODE_NORMAL`,
    )
    callManager = callManager.replace(
      `        audioManager.isSpeakerphoneOn = false
        audioManager.isMicrophoneMute = false
        audioManager.mode = AudioManager.MODE_NORMAL
        resolveVolumeActivity()?.volumeControlStream = AudioManager.STREAM_MUSIC
    }`,
      `        audioManager.isSpeakerphoneOn = false
        audioManager.isMicrophoneMute = false
        audioManager.mode = AudioManager.MODE_NORMAL
        resolveVolumeActivity()?.volumeControlStream = AudioManager.USE_DEFAULT_STREAM_TYPE
    }`,
    )
    if (!callManager.includes('notifyCallRejected(callId: String) {\n        val data = JSObject().apply {\n            put("callId", callId)\n        }\n        eventEmitter?.invoke("callRejected", data)\n        activeCalls.remove(callId)\n        if (activeCalls.isEmpty())')) {
      callManager = callManager.replace(
        `    fun notifyCallRejected(callId: String) {
        val data = JSObject().apply {
            put("callId", callId)
        }
        eventEmitter?.invoke("callRejected", data)
        activeCalls.remove(callId)
    }`,
        `    fun notifyCallRejected(callId: String) {
        val data = JSObject().apply {
            put("callId", callId)
        }
        eventEmitter?.invoke("callRejected", data)
        activeCalls.remove(callId)
        if (activeCalls.isEmpty()) {
            setVoiceCallAudioActive(false)
        }
    }`,
      )
    }
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager MODE_NORMAL (fix blocked system volume)')
  }
}

const ringVolumeStreamResetMarker = 'AiMediaTank reset volume stream after ring'
if (fs.existsSync(incomingRingAudioPath)) {
  let ringHelper = fs.readFileSync(incomingRingAudioPath, 'utf8')
  if (!ringHelper.includes(ringVolumeStreamResetMarker)) {
    ringHelper = ringHelper.replace(
      `        if (!ringVolumeKeysActive) return
        ringVolumeKeysActive = false
        CallVolumeState.ringActive = false
    }`,
      `        if (!ringVolumeKeysActive) return
        ringVolumeKeysActive = false
        CallVolumeState.ringActive = false
        // ${ringVolumeStreamResetMarker}
        if (!CallVolumeState.voiceCallActive) {
            resolveActivity(context)?.volumeControlStream = AudioManager.USE_DEFAULT_STREAM_TYPE
        }
    }`,
    )
    fs.writeFileSync(incomingRingAudioPath, ringHelper)
    changed = true
    console.log('[patch-android-fcm] IncomingRingAudioHelper reset volume stream after ring')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (!callManager.includes(noGlobalAudioMarker)) {
    callManager = callManager.replace(
      /\n    private fun resolveVolumeActivity\(\): android\.app\.Activity\? \{[\s\S]*?\n    fun setVoiceCallAudioActive\(active: Boolean\) \{[\s\S]*?\n    \}\n\n    private fun notifyError/,
      `\n${buildSetVoiceCallAudioActiveBlock()}\n\n    private fun notifyError`,
    )
    callManager = callManager.replace(
      `    fun setAudioRoute(route: String) {
        setVoiceCallAudioActive(true)
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager`,
      `    fun setAudioRoute(route: String) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager`,
    )
    callManager = callManager.replace(
      `    fun setMuted(muted: Boolean) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.isMicrophoneMute = muted
    }`,
      `    fun setMuted(muted: Boolean) {
        // ${noGlobalAudioMarker} — WebRTC track mute is handled in JS.
    }`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager no global AudioManager side effects')
  }
}

const androidAudioCleanupPath = path.join(pluginDir, 'AndroidAudioCleanup.kt')
if (!fs.existsSync(androidAudioCleanupPath)) {
  fs.writeFileSync(
    androidAudioCleanupPath,
    `package com.capacitor.voipcalls

import android.content.Context
import android.media.AudioManager
import android.util.Log

/** Reset global audio routing AiMediaTank may have touched. Does not change volume levels. */
object AndroidAudioCleanup {
    private const val TAG = "AndroidAudioCleanup"

    @JvmStatic
    fun resetIfIdle(context: Context) {
        CapacitorVoipCallsPlugin.getInstance()?.callManager?.releaseIfStale()
        if (CallVolumeState.shouldAdjustMediaVolume()) return
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        try {
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = false
            am.isMicrophoneMute = false
            @Suppress("DEPRECATION")
            am.stopBluetoothSco()
            am.isBluetoothScoOn = false
        } catch (e: Exception) {
            Log.w(TAG, "speaker/bluetooth reset skipped", e)
        }
        if (am.mode != AudioManager.MODE_NORMAL) {
            am.mode = AudioManager.MODE_NORMAL
        }
        @Suppress("DEPRECATION")
        am.abandonAudioFocus(null)
    }
}
`,
  )
  changed = true
  console.log('[patch-android-fcm] AndroidAudioCleanup.kt')
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (!callManager.includes(callActivePlaybackMarker)) {
    callManager = callManager.replace(
      `        if (active) {
            reapplyVolumeControlStream()
            return
        }`,
      `        if (active) {
            // ${callActivePlaybackMarker}
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
            reapplyVolumeControlStream()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attrs = android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                val focusRequest = android.media.AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attrs)
                    .build()
                voiceCallFocusRequest = focusRequest
                audioManager.requestAudioFocus(focusRequest)
            } else {
                @Suppress("DEPRECATION")
                audioManager.requestAudioFocus(
                    null,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN
                )
            }
            return
        }`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager voice call media playback')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes(voiceVolumeMarker) &&
    !callManager.includes(voiceCallRestoreAudioFocusMarker) &&
    (!callManager.includes('voiceCallFocusRequest') ||
      callManager.includes('WebRTC-safe voice call audio'))
  ) {
    if (!callManager.includes('voiceCallFocusRequest')) {
      callManager = callManager.replace(
        '    private var voiceCallAudioActive = false',
        `    private var voiceCallAudioActive = false
    private var voiceCallFocusRequest: android.media.AudioFocusRequest? = null`,
      )
    }
    if (!callManager.includes('voiceCallFocusRequest?.let')) {
      callManager = callManager.replace(
        `    fun releaseGlobalAudioSideEffects() {
        // ${noGlobalAudioMarker}
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = false`,
        `    fun releaseGlobalAudioSideEffects() {
        // ${noGlobalAudioMarker}
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            voiceCallFocusRequest?.let { audioManager.abandonAudioFocusRequest(it) }
            voiceCallFocusRequest = null
        } else {
            @Suppress("DEPRECATION")
            audioManager.abandonAudioFocus(null)
        }
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = false`,
      )
    }
    callManager = callManager.replace(
      /\n    fun setVoiceCallAudioActive\(active: Boolean\) \{[\s\S]*?\n    \}\n\n    private fun notifyError/,
      `
    fun setVoiceCallAudioActive(active: Boolean) {
        // ${voiceVolumeMarker}
        // ${mediaVolumeKeysMarker}
        // ${voiceCallRestoreAudioFocusMarker}
        if (voiceCallAudioActive == active) {
            if (active) reapplyVolumeControlStream()
            return
        }
        voiceCallAudioActive = active
        CallVolumeState.voiceCallActive = active
        if (active) {
            // ${callActivePlaybackMarker}
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
            reapplyVolumeControlStream()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attrs = android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_MEDIA)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                val focusRequest = android.media.AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(attrs)
                    .build()
                voiceCallFocusRequest = focusRequest
                audioManager.requestAudioFocus(focusRequest)
            } else {
                @Suppress("DEPRECATION")
                audioManager.requestAudioFocus(
                    null,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN
                )
            }
            return
        }
        releaseGlobalAudioSideEffects()
    }

    private fun notifyError`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager restore voice call audio focus')
  }
}

const incomingRingNotificationStreamMarker = 'AiMediaTank incoming ring notification stream'

if (fs.existsSync(incomingRingAudioPath)) {
  let ringHelper = fs.readFileSync(incomingRingAudioPath, 'utf8')
  if (!ringHelper.includes(incomingRingNotificationStreamMarker)) {
    const incomingRingAudioSource = `package com.capacitor.voipcalls

import android.app.Activity
import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.audiofx.LoudnessEnhancer
import android.util.Log

/** Incoming ring: notification/ring stream. Outgoing ringback: media stream. */
object IncomingRingAudioHelper {
    private const val TAG = "IncomingRingAudio"
    private const val INCOMING_RING_BOOST_MB = 800
    private var player: MediaPlayer? = null
    private var ringVolumeKeysActive = false
    private var ringVolumeLevel = 1f
    private var ringIncoming = false
    private var ringFocusHeld = false
    private var loudnessEnhancer: LoudnessEnhancer? = null

    private fun resolveActivity(context: Context): Activity? {
        return CapacitorVoipCallsPlugin.getInstance()?.activity
            ?: (context as? Activity)
    }

    fun isActive(): Boolean = ringVolumeKeysActive

    private fun volumeStream(): Int {
        return if (ringIncoming) AudioManager.STREAM_RING else AudioManager.STREAM_MUSIC
    }

    fun reapply(context: Context) {
        if (!ringVolumeKeysActive) return
        resolveActivity(context)?.volumeControlStream = volumeStream()
    }

    private fun releaseIncomingBoost() {
        loudnessEnhancer?.let { enhancer ->
            try {
                enhancer.enabled = false
                enhancer.release()
            } catch (_: Exception) {
            }
        }
        loudnessEnhancer = null
    }

    private fun applyIncomingBoost(player: MediaPlayer) {
        releaseIncomingBoost()
        if (!ringIncoming) return
        try {
            loudnessEnhancer = LoudnessEnhancer(player.audioSessionId).apply {
                setTargetGain(INCOMING_RING_BOOST_MB)
                enabled = true
            }
        } catch (e: Exception) {
            Log.w(TAG, "incoming ring app boost unavailable", e)
        }
    }

    private fun requestRingFocus(audioManager: AudioManager) {
        @Suppress("DEPRECATION")
        val result = audioManager.requestAudioFocus(
            null,
            volumeStream(),
            AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
        )
        ringFocusHeld = result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
    }

    private fun abandonRingFocus(audioManager: AudioManager) {
        if (!ringFocusHeld) return
        @Suppress("DEPRECATION")
        audioManager.abandonAudioFocus(null)
        ringFocusHeld = false
    }

    fun setVolume(level: Float) {
        ringVolumeLevel = level.coerceIn(0f, 1f)
        player?.setVolume(ringVolumeLevel, ringVolumeLevel)
    }

    fun start(context: Context, url: String, incoming: Boolean = true) {
        // ${incomingRingVolumeMarker}
        // ${incomingRingVolumeMarkerV2}
        // ${incomingRingVolumeMarkerV3}
        // ${incomingRingNotificationStreamMarker}
        stop(context)
        ringIncoming = incoming
        ringVolumeKeysActive = true
        CallVolumeState.ringActive = true
        val activity = resolveActivity(context)
        activity?.volumeControlStream = volumeStream()
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.mode = AudioManager.MODE_NORMAL
        if (incoming) {
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
        }
        requestRingFocus(audioManager)
        try {
            val attributes = if (incoming) {
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            } else {
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
            }
            player = MediaPlayer().apply {
                setAudioAttributes(attributes)
                setDataSource(url)
                isLooping = true
                setVolume(1.0f, 1.0f)
                setOnPreparedListener { mp ->
                    try {
                        applyIncomingBoost(mp)
                        mp.setVolume(ringVolumeLevel, ringVolumeLevel)
                        mp.start()
                    } catch (e: Exception) {
                        Log.e(TAG, "start failed", e)
                    }
                }
                setOnErrorListener { _, what, extra ->
                    Log.e(TAG, "MediaPlayer error what=\$what extra=\$extra")
                    true
                }
                prepareAsync()
            }
        } catch (e: Exception) {
            Log.e(TAG, "prepare ring failed for \$url", e)
            stop(context)
        }
    }

    fun stop(context: Context) {
        releaseIncomingBoost()
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        abandonRingFocus(audioManager)
        player?.let { mp ->
            try {
                if (mp.isPlaying) mp.stop()
            } catch (_: Exception) {
            }
            try {
                mp.release()
            } catch (_: Exception) {
            }
        }
        player = null
        if (!ringVolumeKeysActive) return
        ringVolumeKeysActive = false
        CallVolumeState.ringActive = false
        if (!CallVolumeState.voiceCallActive) {
            resolveActivity(context)?.volumeControlStream = AudioManager.USE_DEFAULT_STREAM_TYPE
        }
    }
}
`
    fs.writeFileSync(incomingRingAudioPath, incomingRingAudioSource)
    changed = true
    console.log('[patch-android-fcm] IncomingRingAudioHelper notification ring stream')
  }
}

if (fs.existsSync(pluginPath)) {
  let pluginRingIncoming = fs.readFileSync(pluginPath, 'utf8')
  if (pluginRingIncoming.includes('startCallRing') && pluginRingIncoming.includes('incoming", false)')) {
    pluginRingIncoming = pluginRingIncoming.replace(
      'IncomingRingAudioHelper.start(context, url, call.getBoolean("incoming", false) ?: false)',
      'IncomingRingAudioHelper.start(context, url, call.getBoolean("incoming", true) ?: true)',
    )
    fs.writeFileSync(pluginPath, pluginRingIncoming)
    changed = true
    console.log('[patch-android-fcm] startCallRing defaults incoming=true')
  }
}

const callVolumeJvmFieldMarker = 'AiMediaTank CallVolumeState JvmField'
if (fs.existsSync(callVolumeStatePath)) {
  let callVolumeState = fs.readFileSync(callVolumeStatePath, 'utf8')
  if (!callVolumeState.includes(callVolumeJvmFieldMarker)) {
    callVolumeState = callVolumeState.replace(
      'object CallVolumeState {\n    @Volatile var voiceCallActive',
      `object CallVolumeState {\n    // ${callVolumeJvmFieldMarker}\n    @JvmField @Volatile var voiceCallActive`,
    )
    callVolumeState = callVolumeState.replace(
      '\n    @Volatile var ringActive',
      '\n    @JvmField @Volatile var ringActive',
    )
    fs.writeFileSync(callVolumeStatePath, callVolumeState)
    changed = true
    console.log('[patch-android-fcm] CallVolumeState @JvmField for Java')
  }
}

const callScreenPresentationMarker = 'AiMediaTank CallScreenPresentation'
const callScreenPresentationV2Marker = 'keep-screen-on flags only'
const callScreenPresentationSource = `package com.capacitor.voipcalls

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.view.WindowManager

/** Clears window flags that block the system screen-timeout after voice calls end. */
object CallScreenPresentation {
    // ${callScreenPresentationMarker}
    // ${callScreenPresentationV2Marker}

    @JvmStatic
    fun clearIfIdle(activity: Activity?) {
        if (activity == null || CallVolumeState.shouldAdjustMediaVolume()) return
        clear(activity)
    }

    @JvmStatic
    fun clear(activity: Activity) {
        activity.window.clearFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                or WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
        )
        clearStaleVoiceIncomingIntent(activity)
    }

    private fun clearStaleVoiceIncomingIntent(activity: Activity) {
        val current = activity.intent ?: return
        val data = current.data ?: return
        if (data.getQueryParameter("voiceIncoming") != "1") return
        val builder = data.buildUpon().clearQuery()
        for (name in data.queryParameterNames) {
            if (name == "voiceIncoming" || name == "voiceAction" || name == "callId") continue
            data.getQueryParameter(name)?.let { builder.appendQueryParameter(name, it) }
        }
        activity.intent = Intent(current).apply { setData(builder.build()) }
    }
}
`

if (
  !fs.existsSync(callScreenPresentationPath) ||
  !fs.readFileSync(callScreenPresentationPath, 'utf8').includes(callScreenPresentationV2Marker)
) {
  fs.writeFileSync(callScreenPresentationPath, callScreenPresentationSource)
  changed = true
  console.log('[patch-android-fcm] CallScreenPresentation.kt (wake-lock flags only)')
}

const clearScreenPluginMarker = 'clearCallScreenPresentation'
if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (!pluginSource.includes(clearScreenPluginMarker)) {
    if (pluginSource.includes('fun stopCallRing(call: PluginCall)')) {
      pluginSource = pluginSource.replace(
        `    @PluginMethod
    fun stopCallRing(call: PluginCall) {
        IncomingRingAudioHelper.stop(context)
        call.resolve()
    }`,
        `    @PluginMethod
    fun stopCallRing(call: PluginCall) {
        IncomingRingAudioHelper.stop(context)
        call.resolve()
    }

    @PluginMethod
    fun clearCallScreenPresentation(call: PluginCall) {
        CallScreenPresentation.clearIfIdle(activity)
        call.resolve()
    }`,
      )
    }
    if (!pluginSource.includes(clearScreenPluginMarker) && pluginSource.includes('fun setVoiceCallAudioActive(call: PluginCall)')) {
      pluginSource = pluginSource.replace(
        `        callManager?.setVoiceCallAudioActive(active)
        call.resolve()
    }`,
        `        callManager?.setVoiceCallAudioActive(active)
        call.resolve()
    }`,
      )
    }
    if (pluginSource.includes(clearScreenPluginMarker)) {
      fs.writeFileSync(pluginPath, pluginSource)
      changed = true
      console.log('[patch-android-fcm] clearCallScreenPresentation plugin method')
    }
  }
}

const callScreenHookMarker = 'CallScreenPresentation.clearIfIdle'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (!callManager.includes(callScreenHookMarker)) {
    callManager = callManager.replace(
      `        releaseGlobalAudioSideEffects()
    }

    private fun notifyError(message: String) {`,
      `        releaseGlobalAudioSideEffects()
    }

    private fun notifyError(message: String) {`,
    )
    if (callManager.includes(callScreenHookMarker)) {
      fs.writeFileSync(callManagerPath, callManager)
      changed = true
      console.log('[patch-android-fcm] CallManager clears screen flags when call audio ends')
    }
  }
}

if (fs.existsSync(incomingRingAudioPath)) {
  let ringHelper = fs.readFileSync(incomingRingAudioPath, 'utf8')
  if (!ringHelper.includes(callScreenHookMarker)) {
    ringHelper = ringHelper.replace(
      `        if (!CallVolumeState.voiceCallActive) {
            resolveActivity(context)?.volumeControlStream = AudioManager.USE_DEFAULT_STREAM_TYPE
        }
    }
}`,
      `        if (!CallVolumeState.voiceCallActive) {
            resolveActivity(context)?.volumeControlStream = AudioManager.USE_DEFAULT_STREAM_TYPE
        }
    }
}`,
    )
    if (ringHelper.includes(callScreenHookMarker)) {
      fs.writeFileSync(incomingRingAudioPath, ringHelper)
      changed = true
      console.log('[patch-android-fcm] IncomingRingAudioHelper clears screen flags after ring')
    }
  }
}

if (!changed) {
  console.log('[patch-android-fcm] already patched')
}

// 1.0.18 regression: do not clear lock-screen / intent when ring stops or call audio deactivates.
if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  let pluginChanged = false
  const ringStopWithClear =
    'IncomingRingAudioHelper.stop(context)\n        CallScreenPresentation.clearIfIdle(activity)\n        call.resolve()'
  if (pluginSource.includes(ringStopWithClear)) {
    pluginSource = pluginSource.replace(
      ringStopWithClear,
      'IncomingRingAudioHelper.stop(context)\n        call.resolve()',
    )
    pluginChanged = true
  }
  const audioDeactivateWithClear = `        callManager?.setVoiceCallAudioActive(active)
        if (!active) {
            CallScreenPresentation.clearIfIdle(activity)
        }
        call.resolve()`
  if (pluginSource.includes(audioDeactivateWithClear)) {
    pluginSource = pluginSource.replace(
      audioDeactivateWithClear,
      `        callManager?.setVoiceCallAudioActive(active)
        call.resolve()`,
    )
    pluginChanged = true
  }
  if (pluginChanged) {
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] plugin: screen clear only via clearCallScreenPresentation')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (callManager.includes('CallScreenPresentation.clearIfIdle(resolveVolumeActivity())')) {
    callManager = callManager.replace(
      '        releaseGlobalAudioSideEffects()\n        CallScreenPresentation.clearIfIdle(resolveVolumeActivity())',
      '        releaseGlobalAudioSideEffects()',
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager: no screen clear on audio deactivate')
  }
}

if (fs.existsSync(incomingRingAudioPath)) {
  let ringHelper = fs.readFileSync(incomingRingAudioPath, 'utf8')
  if (ringHelper.includes('CallScreenPresentation.clearIfIdle(resolveActivity(context))')) {
    ringHelper = ringHelper.replace(
      '        CallScreenPresentation.clearIfIdle(resolveActivity(context))\n',
      '',
    )
    fs.writeFileSync(incomingRingAudioPath, ringHelper)
    changed = true
    console.log('[patch-android-fcm] IncomingRingAudioHelper: no screen clear on ring stop')
  }
}
