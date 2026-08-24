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
const chatMessageNotificationPath = path.join(pluginDir, 'ChatMessageNotificationHelper.kt')
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
        // AiMediaTank skip cancelled present
        val cancelledAt = context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
            .getLong("cancelled_" + callId.lowercase(), 0L)
        if (cancelledAt > 0L && System.currentTimeMillis() - cancelledAt < 120_000L) {
            Log.i(TAG, "skip present — already cancelled $callId")
            dismiss(context)
            return
        }
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

const chatMessageNotificationSource = `package com.capacitor.voipcalls

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.util.Log

/** Foreground + background FCM chat alerts with sound and heads-up banner. */
object ChatMessageNotificationHelper {
    private const val TAG = "ChatMessageNotif"
    const val CHANNEL_ID = "aimediatank_messages_v2"

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val sound: Uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Chat messages",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "AiMediaTank private chat message alerts"
            enableVibration(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setSound(
                sound,
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
        }
        nm.createNotificationChannel(channel)
    }

    /** Create channel at app launch so background FCM notifications are not dropped. */
    fun ensureChannelAtStartup(context: Context) {
        try {
            ensureChannel(context.applicationContext)
        } catch (e: Exception) {
            Log.e(TAG, "ensureChannelAtStartup failed", e)
        }
    }

    fun show(context: Context, title: String, body: String, url: String?, senderId: String?) {
        try {
            ensureChannel(context)
            val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
                ?: return
            if (!url.isNullOrBlank()) launch.data = Uri.parse(url)
            launch.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0
            val pending = PendingIntent.getActivity(
                context,
                (senderId ?: title).hashCode(),
                launch,
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
                .setContentTitle(title)
                .setContentText(body)
                .setAutoCancel(true)
                .setContentIntent(pending)
                .setCategory(Notification.CATEGORY_MESSAGE)
                .setPriority(Notification.PRIORITY_HIGH)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder.setVisibility(Notification.VISIBILITY_PUBLIC)
            }
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            nm.notify((senderId ?: title).hashCode(), builder.build())
        } catch (e: Exception) {
            Log.e(TAG, "show failed", e)
        }
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

if (
  !fs.existsSync(chatMessageNotificationPath) ||
  !fs.readFileSync(chatMessageNotificationPath, 'utf8').includes('ChatMessageNotificationHelper')
) {
  fs.writeFileSync(chatMessageNotificationPath, chatMessageNotificationSource)
  changed = true
  console.log('[patch-android-fcm] added ChatMessageNotificationHelper.kt')
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
                // AiMediaTank remember cancelled call id
                val prefs = context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                prefs.edit().putLong("cancelled_" + cancelCallId.lowercase(), System.currentTimeMillis()).apply()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val manager = CapacitorVoipCallsPlugin.getInstance()?.callManager ?: CallManager(context)
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

// Upgrade existing cancel handler to remember cancelled call ids.
if (
  source.includes(cancelMarker) &&
  !source.includes('cancelled_" + cancelCallId.lowercase()')
) {
  const oldCancel =
    `            if (data["action"]?.lowercase() == "cancel") {
                val cancelCallId = data["callId"] ?: return
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {`
  const newCancel =
    `            if (data["action"]?.lowercase() == "cancel") {
                val cancelCallId = data["callId"] ?: return
                val prefs = context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                prefs.edit().putLong("cancelled_" + cancelCallId.lowercase(), System.currentTimeMillis()).apply()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {`
  if (source.includes(oldCancel)) {
    source = source.replace(oldCancel, newCancel)
    changed = true
    console.log('[patch-android-fcm] FCM cancel remembers cancelled call id')
  }
}

const chatRouteMarker = 'AiMediaTank FCM chat message route'
if (!source.includes(chatRouteMarker)) {
  const chatRouteAnchor = `            if (type == TYPE_CALL) {`
  const chatRouteInsert = `            // ${chatRouteMarker}
            if (data["type"]?.lowercase() == "chat_message") {
                val chatTitle = title ?: data["title"] ?: "AiMediaTank"
                val chatBody = body ?: data["body"] ?: "New message"
                val chatUrl = data["url"]
                val senderId = data["senderId"]
                ChatMessageNotificationHelper.show(context, chatTitle, chatBody, chatUrl, senderId)
                return
            }

            if (type == TYPE_CALL) {`
  if (source.includes(chatRouteAnchor)) {
    source = source.replace(chatRouteAnchor, chatRouteInsert)
    changed = true
    console.log('[patch-android-fcm] added FCM chat message route')
  }
}

// Skip reporting ConnectionService UI when cancel already arrived.
if (
  source.includes('manager.reportIncomingCall(') &&
  !source.includes('AiMediaTank skip cancelled incoming')
) {
  const reportAnchor = `                try {
                    val manager = CallManager(context)
                    manager.reportIncomingCall(`
  const reportInsert = `                // AiMediaTank skip cancelled incoming
                val cancelledAt = context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                    .getLong("cancelled_" + callId.lowercase(), 0L)
                if (cancelledAt > 0L && System.currentTimeMillis() - cancelledAt < 120_000L) {
                    android.util.Log.i("CapacitorPushCalls", "skip incoming — already cancelled $callId")
                    IncomingCallUiHelper.dismiss(context)
                    emitFromService("callEnded", JSObject().apply { put("callId", callId) })
                    return
                }
                try {
                    val manager = CallManager(context)
                    manager.reportIncomingCall(`
  if (source.includes(reportAnchor)) {
    source = source.replace(reportAnchor, reportInsert)
    changed = true
    console.log('[patch-android-fcm] skip ConnectionService report after early cancel')
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
const voiceCallMediaVolumeLevelMarker = 'AiMediaTank voice call media volume level'
const voiceCallLoudnessBoostMarker = 'AiMediaTank voice call loudness enhancer'
const voiceCallCommunicationModeMarker = 'AiMediaTank voice call communication mode'
const voiceCallRingLoudnessModeMarker = 'AiMediaTank voice call ring loudness mode'

function buildSetVoiceCallAudioActiveBlock() {
  return `    private fun resolveVolumeActivity(): android.app.Activity? {
        return (context as? android.app.Activity)
            ?: CapacitorVoipCallsPlugin.getInstance()?.activity
    }

    fun reapplyVolumeControlStream() {
        if (!voiceCallAudioActive && !CallVolumeState.ringActive) return
        val stream = if (voiceCallAudioActive) {
            AudioManager.STREAM_VOICE_CALL
        } else {
            AudioManager.STREAM_MUSIC
        }
        resolveVolumeActivity()?.volumeControlStream = stream
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
            // ${voiceCallCommunicationModeMarker}
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
            reapplyVolumeControlStream()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attrs = android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION)
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
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN
                )
            }
            applyTelecomSpeakerRoute()
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
        val normalized = callId.lowercase()
        val connection = activeCalls[callId]
            ?: activeCalls.entries.firstOrNull { it.key.lowercase() == normalized }?.value
        if (connection != null) {
            connection.onAnswer()
        } else {
            // AiMediaTank in-app accept fallback when Telecom connection missing
            notifyCallAnswered(callId)
        }
    }`,
    )

    callManager = callManager.replace(
      `    fun answerCall(callId: String) {
        setVoiceCallAudioActive(true)
        activeCalls[callId]?.onAnswer()
    }`,
      `    fun answerCall(callId: String) {
        setVoiceCallAudioActive(true)
        val normalized = callId.lowercase()
        val connection = activeCalls[callId]
            ?: activeCalls.entries.firstOrNull { it.key.lowercase() == normalized }?.value
        if (connection != null) {
            connection.onAnswer()
        } else {
            // AiMediaTank in-app accept fallback when Telecom connection missing
            notifyCallAnswered(callId)
        }
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

if (fs.existsSync(pluginPath)) {
  let pluginVoiceVol = fs.readFileSync(pluginPath, 'utf8')
  if (!pluginVoiceVol.includes('setVoiceCallMediaVolume')) {
    pluginVoiceVol = pluginVoiceVol.replace(
      `    @PluginMethod
    fun setCallRingVolume(call: PluginCall) {
        val level = call.getFloat("level", 1f) ?: 1f
        IncomingRingAudioHelper.setVolume(level)
        call.resolve()
    }`,
      `    @PluginMethod
    fun setCallRingVolume(call: PluginCall) {
        val level = call.getFloat("level", 1f) ?: 1f
        IncomingRingAudioHelper.setVolume(level)
        call.resolve()
    }

    @PluginMethod
    fun setVoiceCallMediaVolume(call: PluginCall) {
        val level = call.getFloat("level", 1f) ?: 1f
        callManager?.setVoiceCallMediaVolume(level)
        call.resolve()
    }`,
    )
    fs.writeFileSync(pluginPath, pluginVoiceVol)
    changed = true
    console.log('[patch-android-fcm] CapacitorVoipCallsPlugin setVoiceCallMediaVolume')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (!callManager.includes(voiceCallMediaVolumeLevelMarker)) {
    callManager = callManager.replace(
      '    private fun notifyError(message: String) {',
      `    fun setVoiceCallMediaVolume(level: Float) {
        // ${voiceCallMediaVolumeLevelMarker}
        // ${voiceCallCommunicationModeMarker}
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val clamped = level.coerceIn(0f, 1f)
        val streams = intArrayOf(AudioManager.STREAM_VOICE_CALL, AudioManager.STREAM_MUSIC)
        if (clamped <= 0f) {
            for (stream in streams) {
                audioManager.setStreamVolume(stream, 0, 0)
            }
            reapplyVolumeControlStream()
            return
        }
        val ringMax = audioManager.getStreamMaxVolume(AudioManager.STREAM_RING)
        val ringFraction = if (ringMax > 0) {
            audioManager.getStreamVolume(AudioManager.STREAM_RING).toFloat() / ringMax.toFloat()
        } else {
            1f
        }
        val targetFraction = kotlin.math.max(clamped, ringFraction)
        for (stream in streams) {
            val max = audioManager.getStreamMaxVolume(stream)
            if (max <= 0) continue
            val target = (max * targetFraction).toInt().coerceIn(1, max)
            audioManager.setStreamVolume(stream, target, 0)
        }
        reapplyVolumeControlStream()
    }

    private fun notifyError(message: String) {`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager setVoiceCallMediaVolume')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (!callManager.includes(voiceCallLoudnessBoostMarker)) {
    if (!callManager.includes('import android.media.audiofx.LoudnessEnhancer')) {
      callManager = callManager.replace(
        'import android.media.AudioManager',
        'import android.media.AudioManager\nimport android.media.audiofx.LoudnessEnhancer',
      )
    }
    if (!callManager.includes('voiceCallLoudnessEnhancer')) {
      callManager = callManager.replace(
        '    private var voiceCallFocusRequest: android.media.AudioFocusRequest? = null',
        `    private var voiceCallFocusRequest: android.media.AudioFocusRequest? = null
    private var voiceCallLoudnessEnhancer: LoudnessEnhancer? = null
    private val voiceCallLoudnessBoostMb = 800`,
      )
      if (!callManager.includes('voiceCallLoudnessEnhancer')) {
        callManager = callManager.replace(
          '    private var voiceCallAudioActive = false',
          `    private var voiceCallAudioActive = false
    private var voiceCallLoudnessEnhancer: LoudnessEnhancer? = null
    private val voiceCallLoudnessBoostMb = 800`,
        )
      }
    }
    callManager = callManager.replace(
      '    fun reapplyVolumeControlStream() {',
      `    private fun enableVoiceCallLoudnessBoost() {
        // ${voiceCallLoudnessBoostMarker}
        releaseVoiceCallLoudnessBoost()
        try {
            voiceCallLoudnessEnhancer = LoudnessEnhancer(0).apply {
                setTargetGain(voiceCallLoudnessBoostMb)
                enabled = true
            }
        } catch (e: Exception) {
            android.util.Log.w("CallManager", "voice call loudness boost unavailable", e)
        }
    }

    private fun releaseVoiceCallLoudnessBoost() {
        voiceCallLoudnessEnhancer?.let { enhancer ->
            try {
                enhancer.enabled = false
                enhancer.release()
            } catch (_: Exception) {
            }
        }
        voiceCallLoudnessEnhancer = null
    }

    fun reapplyVolumeControlStream() {`,
    )
    callManager = callManager.replace(
      '            audioManager.requestAudioFocus(focusRequest)\n            } else {',
      '            audioManager.requestAudioFocus(focusRequest)\n            } else {',
    )
    callManager = callManager.replace(
      /audioManager\.requestAudioFocus\(\n                    null,\n                    AudioManager\.STREAM_MUSIC,\n                    AudioManager\.AUDIOFOCUS_GAIN\n                \)\n            \}\n            return\n        \}\n        releaseGlobalAudioSideEffects\(\)/,
      `audioManager.requestAudioFocus(
                    null,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN
                )
            }
            enableVoiceCallLoudnessBoost()
            return
        }
        releaseGlobalAudioSideEffects()`,
    )
    callManager = callManager.replace(
      `        if (audioManager.mode != AudioManager.MODE_NORMAL) {
            audioManager.mode = AudioManager.MODE_NORMAL
        }
        resolveVolumeActivity()?.volumeControlStream = AudioManager.USE_DEFAULT_STREAM_TYPE
    }

    fun setVoiceCallAudioActive(active: Boolean) {`,
      `        if (audioManager.mode != AudioManager.MODE_NORMAL) {
            audioManager.mode = AudioManager.MODE_NORMAL
        }
        releaseVoiceCallLoudnessBoost()
        resolveVolumeActivity()?.volumeControlStream = AudioManager.USE_DEFAULT_STREAM_TYPE
    }

    fun setVoiceCallAudioActive(active: Boolean) {`,
    )
    callManager = callManager.replace(
      /\n    fun setVoiceCallMediaVolume\(level: Float\) \{[\s\S]*?reapplyVolumeControlStream\(\)\n    \}/,
      `
    fun setVoiceCallMediaVolume(level: Float) {
        // ${voiceCallMediaVolumeLevelMarker}
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val stream = AudioManager.STREAM_MUSIC
        val max = audioManager.getStreamMaxVolume(stream)
        if (max <= 0) return
        val clamped = level.coerceIn(0f, 1f)
        if (clamped <= 0f) {
            audioManager.setStreamVolume(stream, 0, 0)
            reapplyVolumeControlStream()
            return
        }
        val ringMax = audioManager.getStreamMaxVolume(AudioManager.STREAM_RING)
        val ringFraction = if (ringMax > 0) {
            audioManager.getStreamVolume(AudioManager.STREAM_RING).toFloat() / ringMax.toFloat()
        } else {
            1f
        }
        val targetFraction = kotlin.math.max(clamped, ringFraction)
        val target = (max * targetFraction).toInt().coerceIn(1, max)
        audioManager.setStreamVolume(stream, target, 0)
        reapplyVolumeControlStream()
    }`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager voice call loudness enhancer')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes(voiceCallLoudnessBoostMarker) &&
    !callManager.includes(voiceCallCommunicationModeMarker)
  ) {
    callManager = callManager.replace(
      /fun reapplyVolumeControlStream\(\) \{[\s\S]*?\n    \}\n\n    fun releaseIfStale/,
      `fun reapplyVolumeControlStream() {
        if (!voiceCallAudioActive && !CallVolumeState.ringActive) return
        val stream = if (voiceCallAudioActive) {
            AudioManager.STREAM_VOICE_CALL
        } else {
            AudioManager.STREAM_MUSIC
        }
        resolveVolumeActivity()?.volumeControlStream = stream
    }

    fun releaseIfStale`,
    )
    callManager = callManager.replace(
      /\n    fun setVoiceCallAudioActive\(active: Boolean\) \{[\s\S]*?\n    \}\n\n    fun setVoiceCallMediaVolume/,
      `
    fun setVoiceCallAudioActive(active: Boolean) {
        // ${voiceVolumeMarker}
        // ${mediaVolumeKeysMarker}
        // ${voiceCallRestoreAudioFocusMarker}
        // ${voiceCallCommunicationModeMarker}
        if (voiceCallAudioActive == active) {
            if (active) reapplyVolumeControlStream()
            return
        }
        voiceCallAudioActive = active
        CallVolumeState.voiceCallActive = active
        if (active) {
            // ${callActivePlaybackMarker}
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
            reapplyVolumeControlStream()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attrs = android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION)
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
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN
                )
            }
            enableVoiceCallLoudnessBoost()
            return
        }
        releaseGlobalAudioSideEffects()
    }

    fun setVoiceCallMediaVolume`,
    )
    callManager = callManager.replace(
      /\n    fun setVoiceCallMediaVolume\(level: Float\) \{[\s\S]*?\n    \}\n\n    private fun notifyError/,
      `
    fun setVoiceCallMediaVolume(level: Float) {
        // ${voiceCallMediaVolumeLevelMarker}
        // ${voiceCallCommunicationModeMarker}
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val clamped = level.coerceIn(0f, 1f)
        val streams = intArrayOf(AudioManager.STREAM_VOICE_CALL, AudioManager.STREAM_MUSIC)
        if (clamped <= 0f) {
            for (stream in streams) {
                audioManager.setStreamVolume(stream, 0, 0)
            }
            reapplyVolumeControlStream()
            return
        }
        val ringMax = audioManager.getStreamMaxVolume(AudioManager.STREAM_RING)
        val ringFraction = if (ringMax > 0) {
            audioManager.getStreamVolume(AudioManager.STREAM_RING).toFloat() / ringMax.toFloat()
        } else {
            1f
        }
        val targetFraction = kotlin.math.max(clamped, ringFraction)
        for (stream in streams) {
            val max = audioManager.getStreamMaxVolume(stream)
            if (max <= 0) continue
            val target = (max * targetFraction).toInt().coerceIn(1, max)
            audioManager.setStreamVolume(stream, target, 0)
        }
        reapplyVolumeControlStream()
    }

    private fun notifyError`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager voice call communication mode')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes(voiceCallCommunicationModeMarker) &&
    callManager.includes(avoidInCommunicationMarker)
  ) {
    callManager = callManager.replace(
      `            // ${avoidInCommunicationMarker}\n            audioManager.mode = AudioManager.MODE_NORMAL`,
      '            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION',
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager restore MODE_IN_COMMUNICATION for voice calls')
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
  if (!callManager.includes(avoidInCommunicationMarker) && !callManager.includes(voiceCallCommunicationModeMarker)) {
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
const appSystemEffectsGuardPath = path.join(pluginDir, 'AppSystemEffectsGuard.kt')
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
const callScreenPresentationMainThreadMarker = 'main looper for window flags'
const callScreenPresentationSleepUnlockMarker = 'reset show-when-locked on clear'
const callScreenPresentationFlagsOnlyMarker = 'clearWindowFlagsOnly'
const callScreenPresentationSource = `package com.capacitor.voipcalls

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.WindowManager

/** Clears window flags that block the system screen-timeout after voice calls end. */
object CallScreenPresentation {
    // ${callScreenPresentationMarker}
    // ${callScreenPresentationV2Marker}
    // ${callScreenPresentationMainThreadMarker}
    // ${callScreenPresentationSleepUnlockMarker}
    // ${callScreenPresentationFlagsOnlyMarker}

    private val mainHandler = Handler(Looper.getMainLooper())

    @JvmStatic
    fun clearIfIdle(activity: Activity?) {
        if (activity == null || CallVolumeState.shouldAdjustMediaVolume()) return
        clear(activity)
    }

    @JvmStatic
    fun clear(activity: Activity) {
        runOnMain {
            clearWindowFlags(activity)
            clearStaleVoiceIncomingIntent(activity)
        }
    }

    /** Release keep-screen-on without stripping incoming-call deep link params. */
    @JvmStatic
    fun clearWindowFlagsOnly(activity: Activity) {
        runOnMain {
            clearWindowFlags(activity)
        }
    }

    private fun clearWindowFlags(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            activity.setShowWhenLocked(false)
            activity.setTurnScreenOn(false)
        }
        activity.window.clearFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                or WindowManager.LayoutParams.FLAG_ALLOW_LOCK_WHILE_SCREEN_ON
        )
    }

    private fun runOnMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            block()
        } else {
            mainHandler.post(block)
        }
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

if (fs.existsSync(callScreenPresentationPath)) {
  const existingPresentation = fs.readFileSync(callScreenPresentationPath, 'utf8')
  if (
    !existingPresentation.includes(callScreenPresentationFlagsOnlyMarker) &&
    existingPresentation.includes('fun clear(activity: Activity) {')
  ) {
    fs.writeFileSync(callScreenPresentationPath, callScreenPresentationSource)
    changed = true
    console.log('[patch-android-fcm] CallScreenPresentation.kt (clearWindowFlagsOnly)')
  } else if (
    !existingPresentation.includes(callScreenPresentationSleepUnlockMarker) &&
    existingPresentation.includes('fun clear(activity: Activity) {')
  ) {
    fs.writeFileSync(callScreenPresentationPath, callScreenPresentationSource)
    changed = true
    console.log('[patch-android-fcm] CallScreenPresentation.kt (sleep unlock + main-thread flags)')
  } else if (
    !existingPresentation.includes(callScreenPresentationMainThreadMarker) &&
    existingPresentation.includes('fun clear(activity: Activity) {')
  ) {
    fs.writeFileSync(callScreenPresentationPath, callScreenPresentationSource)
    changed = true
    console.log('[patch-android-fcm] CallScreenPresentation.kt (main-thread window flags)')
  }
} else {
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
        activity?.let { CallScreenPresentation.clear(it) }
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

const forceClearScreenPluginMarker = 'clearCallScreenPresentation uses force clear'
if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (
    pluginSource.includes('fun clearCallScreenPresentation(call: PluginCall)') &&
    pluginSource.includes('CallScreenPresentation.clearIfIdle(activity)') &&
    !pluginSource.includes(forceClearScreenPluginMarker)
  ) {
    pluginSource = pluginSource.replace(
      `    fun clearCallScreenPresentation(call: PluginCall) {
        CallScreenPresentation.clearIfIdle(activity)
        call.resolve()
    }`,
      `    fun clearCallScreenPresentation(call: PluginCall) {
        // ${forceClearScreenPluginMarker}
        activity?.let { CallScreenPresentation.clear(it) }
        call.resolve()
    }`,
    )
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] clearCallScreenPresentation: force clear after call')
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

// --- Android native WebRTC (KakaoTalk-style) ---
const nativeWebRtcEngineSourcePath = path.join(__dirname, 'android-native', 'NativeVoiceWebRtcEngine.kt')
const nativeWebRtcEngineDestPath = path.join(pluginDir, 'NativeVoiceWebRtcEngine.kt')
const nativeWebRtcMarker = 'AiMediaTank Android native WebRTC'
const pluginBuildGradlePath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@kapsula-chat',
  'capacitor-push-calls',
  'android',
  'build.gradle',
)

if (fs.existsSync(nativeWebRtcEngineSourcePath)) {
  const engineSource = fs.readFileSync(nativeWebRtcEngineSourcePath, 'utf8')
  if (!fs.existsSync(nativeWebRtcEngineDestPath) || fs.readFileSync(nativeWebRtcEngineDestPath, 'utf8') !== engineSource) {
    fs.writeFileSync(nativeWebRtcEngineDestPath, engineSource)
    changed = true
    console.log('[patch-android-fcm] NativeVoiceWebRtcEngine.kt')
  }
}

const textureViewRendererSourcePath = path.join(__dirname, 'android-native', 'TextureViewRenderer.kt')
const textureViewRendererDestPath = path.join(pluginDir, 'TextureViewRenderer.kt')
if (fs.existsSync(textureViewRendererSourcePath)) {
  const tvSource = fs.readFileSync(textureViewRendererSourcePath, 'utf8')
  if (!fs.existsSync(textureViewRendererDestPath) || fs.readFileSync(textureViewRendererDestPath, 'utf8') !== tvSource) {
    fs.writeFileSync(textureViewRendererDestPath, tvSource)
    changed = true
    console.log('[patch-android-fcm] TextureViewRenderer.kt')
  }
}

const webrtcVersion = '1.3.10'
const webrtcDep = `implementation 'io.getstream:stream-webrtc-android:${webrtcVersion}'`

if (fs.existsSync(pluginBuildGradlePath)) {
  let gradle = fs.readFileSync(pluginBuildGradlePath, 'utf8')
  if (!gradle.includes('stream-webrtc-android')) {
    gradle = gradle.replace(
      'dependencies {',
      `dependencies {\n    ${webrtcDep}`,
    )
    fs.writeFileSync(pluginBuildGradlePath, gradle)
    changed = true
    console.log('[patch-android-fcm] WebRTC dependency')
  } else if (!gradle.includes(`stream-webrtc-android:${webrtcVersion}`)) {
    gradle = gradle.replace(
      /implementation 'io\.getstream:stream-webrtc-android:[^']+'/,
      webrtcDep,
    )
    fs.writeFileSync(pluginBuildGradlePath, gradle)
    changed = true
    console.log(`[patch-android-fcm] WebRTC dependency -> ${webrtcVersion}`)
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (!callManager.includes(nativeWebRtcMarker)) {
    callManager = callManager.replace(
      '    private val activeCalls = mutableMapOf<String, VoipConnection>()',
      `    private val activeCalls = mutableMapOf<String, VoipConnection>()
    private val declineTokensByCallId = mutableMapOf<String, String>()
    // ${nativeWebRtcMarker}`,
    )

    callManager = callManager.replace(
      `            eventEmitter?.invoke("incomingCall", data)
            // AiMediaTank present incoming call UI`,
      `            metadata?.getString("declineToken")?.trim()?.takeIf { it.isNotEmpty() }?.let {
                declineTokensByCallId[callId.lowercase()] = it
            }
            eventEmitter?.invoke("incomingCall", data)
            // AiMediaTank present incoming call UI`,
    )

    callManager = callManager.replace(
      `    fun notifyCallAnswered(callId: String) {
        val data = JSObject().apply {
            put("callId", callId)
        }
        eventEmitter?.invoke("callAnswered", data)
    }`,
      `    fun notifyCallAnswered(callId: String) {
        val token = declineTokensByCallId[callId.lowercase()]
        val data = JSObject().apply {
            put("callId", callId)
            put("nativeWebRtc", true)
            if (token != null) put("declineToken", token)
        }
        eventEmitter?.invoke("callAnswered", data)
    }

    // AiMediaTank native WebRTC base URL fallback
    fun resolveWebRtcBaseUrl(): String {
        val fromBridge = CapacitorVoipCallsPlugin.getInstance()?.bridge?.serverUrl?.toString()?.trimEnd('/')
        if (!fromBridge.isNullOrEmpty() && !fromBridge.contains("localhost")) {
            return fromBridge
        }
        return "https://aimediatank.com"
    }

    private fun startNativeWebRtcAnswer(callId: String, token: String?) {
        val emitter = eventEmitter ?: return
        NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl(), emitter).prepareAnswer(callId, token)
    }

    fun startNativeWebRtcCaller(callId: String, iceServersJson: org.json.JSONArray?, wantsVideo: Boolean = false) {
        val emitter = eventEmitter ?: return
        NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl(), emitter).startCaller(callId, iceServersJson, wantsVideo)
    }

    fun endNativeWebRtc() {
        NativeVoiceWebRtcEngine.endGlobal()
    }`,
    )

    callManager = callManager.replace(
      `    fun endCall(callId: String) {
        activeCalls[callId]?.onDisconnect()
        activeCalls.remove(callId)
        if (activeCalls.isEmpty()) {
            setVoiceCallAudioActive(false)
        }
    }`,
      `    fun endCall(callId: String) {
        activeCalls[callId]?.onDisconnect()
        activeCalls.remove(callId)
        declineTokensByCallId.remove(callId.lowercase())
        // Only if the engine still owns this call — after NativeVoiceWebRtcEngine.endCall
        // injects callkit-end, a second endGlobal() double-frees Dialog/EGL (Samsung abort).
        if (NativeVoiceWebRtcEngine.isHandlingCallId(callId)) {
            endNativeWebRtc()
        }
        if (activeCalls.isEmpty()) {
            setVoiceCallAudioActive(false)
        }
    }`,
    )

    callManager = callManager.replace(
      `    fun setMuted(muted: Boolean) {
        // AiMediaTank no global AudioManager side effects — WebRTC track mute is handled in JS.
    }`,
      `    fun setMuted(muted: Boolean) {
        val emitter = eventEmitter ?: return
        NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl(), emitter).setMuted(muted)
    }`,
    )

    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager native WebRTC hooks')
  }

  // Upgrade previously patched CallManager.endCall that always called endNativeWebRtc().
  callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('declineTokensByCallId.remove(callId.lowercase())') &&
    callManager.includes('endNativeWebRtc()') &&
    !callManager.includes('Only if the engine still owns this call')
  ) {
    const upgraded = callManager.replace(
      `        declineTokensByCallId.remove(callId.lowercase())
        endNativeWebRtc()
        if (activeCalls.isEmpty()) {
            setVoiceCallAudioActive(false)
        }`,
      `        declineTokensByCallId.remove(callId.lowercase())
        // Only if the engine still owns this call — after NativeVoiceWebRtcEngine.endCall
        // injects callkit-end, a second endGlobal() double-frees Dialog/EGL (Samsung abort).
        if (NativeVoiceWebRtcEngine.isHandlingCallId(callId)) {
            endNativeWebRtc()
        }
        if (activeCalls.isEmpty()) {
            setVoiceCallAudioActive(false)
        }`,
    )
    if (upgraded !== callManager) {
      fs.writeFileSync(callManagerPath, upgraded)
      changed = true
      console.log('[patch-android-fcm] CallManager.endCall gate endNativeWebRtc')
    }
  }
}

const nativeWebRtcPluginMarker = 'prepareNativeWebRtcCaller'
if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (!pluginSource.includes(nativeWebRtcPluginMarker)) {
    const insertAfter = pluginSource.includes('fun clearCallScreenPresentation(call: PluginCall)')
      ? `    @PluginMethod
    fun clearCallScreenPresentation(call: PluginCall) {
        activity?.let { CallScreenPresentation.clear(it) }
        call.resolve()
    }`
      : `    @PluginMethod
    fun setVoiceCallMediaVolume(call: PluginCall) {
        val level = call.getFloat("level", 1f)
        callManager?.setVoiceCallMediaVolume(level)
        call.resolve()
    }`

    pluginSource = pluginSource.replace(
      insertAfter,
      `${insertAfter}

    @PluginMethod
    fun prepareNativeWebRtcCaller(call: PluginCall) {
        val callId = call.getString("callId") ?: run {
            call.reject("callId is required")
            return
        }
        val iceArray = call.getArray("iceServers")
        val iceJson = if (iceArray != null) org.json.JSONArray(iceArray.toString()) else null
        val hasVideo = call.getBoolean("hasVideo", false) ?: false
        callManager?.startNativeWebRtcCaller(callId, iceJson, hasVideo)
        call.resolve()
    }

    @PluginMethod
    fun prepareNativeWebRtcAnswer(call: PluginCall) {
        val callId = call.getString("callId") ?: run {
            call.reject("callId is required")
            return
        }
        val token = call.getString("declineToken")
        val baseUrl = bridge.serverUrl.toString().trimEnd('/')
        val hasVideo = call.getBoolean("hasVideo", false) ?: false
        NativeVoiceWebRtcEngine.shared(context, baseUrl, ::emitEvent).prepareAnswer(callId, token, wantsVideo = hasVideo)
        call.resolve()
    }

    @PluginMethod
    fun endNativeWebRtc(call: PluginCall) {
        callManager?.endNativeWebRtc()
        call.resolve()
    }

    @PluginMethod
    fun setNativeWebRtcMuted(call: PluginCall) {
        val muted = call.getBoolean("muted", false) ?: false
        callManager?.setMuted(muted)
        call.resolve()
    }

    @PluginMethod
    fun requestCallMediaPermissions(call: PluginCall) {
        val hasVideo = call.getBoolean("hasVideo", false) ?: false
        val baseUrl = bridge.serverUrl.toString().trimEnd('/')
        NativeVoiceWebRtcEngine.shared(context, baseUrl, ::emitEvent)
            .requestCallMediaPermissions(hasVideo)
        call.resolve()
    }`,
    )
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] CapacitorVoipCallsPlugin native WebRTC methods')
  }

  // Upgrade: expose requestCallMediaPermissions for Talk pre-call OS dialogs.
  pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (
    pluginSource.includes('fun setNativeWebRtcMuted(call: PluginCall)') &&
    !pluginSource.includes('fun requestCallMediaPermissions(call: PluginCall)')
  ) {
    pluginSource = pluginSource.replace(
      `    @PluginMethod
    fun setNativeWebRtcMuted(call: PluginCall) {
        val muted = call.getBoolean("muted", false) ?: false
        callManager?.setMuted(muted)
        call.resolve()
    }`,
      `    @PluginMethod
    fun setNativeWebRtcMuted(call: PluginCall) {
        val muted = call.getBoolean("muted", false) ?: false
        callManager?.setMuted(muted)
        call.resolve()
    }

    @PluginMethod
    fun requestCallMediaPermissions(call: PluginCall) {
        val hasVideo = call.getBoolean("hasVideo", false) ?: false
        val baseUrl = bridge.serverUrl.toString().trimEnd('/')
        NativeVoiceWebRtcEngine.shared(context, baseUrl, ::emitEvent)
            .requestCallMediaPermissions(hasVideo)
        call.resolve()
    }`,
    )
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] CapacitorVoipCallsPlugin requestCallMediaPermissions')
  }
}

const nativeWebRtcMutedBroken =
  'fun setNativeWebRtcMuted(call: PluginCall) {\n        val muted = call.getBoolean("muted", false)\n        callManager?.setMuted(muted)'
const nativeWebRtcMutedFixed =
  'fun setNativeWebRtcMuted(call: PluginCall) {\n        val muted = call.getBoolean("muted", false) ?: false\n        callManager?.setMuted(muted)'
if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (pluginSource.includes(nativeWebRtcMutedBroken)) {
    pluginSource = pluginSource.replace(nativeWebRtcMutedBroken, nativeWebRtcMutedFixed)
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] fix setNativeWebRtcMuted nullable Boolean')
  }
}

const webRtcBaseUrlFixMarker = 'AiMediaTank native WebRTC base URL fallback'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (!callManager.includes(webRtcBaseUrlFixMarker)) {
    callManager = callManager.replace(
      `    private fun nativeWebRtcBaseUrl(): String? {
        return CapacitorVoipCallsPlugin.getInstance()?.bridge?.serverUrl?.toString()?.trimEnd('/')
    }

    private fun startNativeWebRtcAnswer(callId: String, token: String?) {
        val baseUrl = nativeWebRtcBaseUrl() ?: return
        val emitter = eventEmitter ?: return
        NativeVoiceWebRtcEngine.shared(context, baseUrl, emitter).prepareAnswer(callId, token)
    }

    fun startNativeWebRtcCaller(callId: String, iceServersJson: org.json.JSONArray?) {
        val baseUrl = nativeWebRtcBaseUrl() ?: return
        val emitter = eventEmitter ?: return
        NativeVoiceWebRtcEngine.shared(context, baseUrl, emitter).startCaller(callId, iceServersJson)
    }`,
      `    // ${webRtcBaseUrlFixMarker}
    fun resolveWebRtcBaseUrl(): String {
        val fromBridge = CapacitorVoipCallsPlugin.getInstance()?.bridge?.serverUrl?.toString()?.trimEnd('/')
        if (!fromBridge.isNullOrEmpty() && !fromBridge.contains("localhost")) {
            return fromBridge
        }
        return "https://aimediatank.com"
    }

    private fun startNativeWebRtcAnswer(callId: String, token: String?) {
        val emitter = eventEmitter ?: return
        NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl(), emitter).prepareAnswer(callId, token)
    }

    fun startNativeWebRtcCaller(callId: String, iceServersJson: org.json.JSONArray?, wantsVideo: Boolean = false) {
        val emitter = eventEmitter ?: return
        NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl(), emitter).startCaller(callId, iceServersJson, wantsVideo)
    }`,
    )
    if (callManager.includes('declineTokensByCallId[callId] = it')) {
      callManager = callManager.replace(
        'declineTokensByCallId[callId] = it',
        'declineTokensByCallId[callId.lowercase()] = it',
      )
    }
    if (callManager.includes('val token = declineTokensByCallId[callId]')) {
      callManager = callManager.replace(
        'val token = declineTokensByCallId[callId]',
        'val token = declineTokensByCallId[callId.lowercase()]',
      )
    }
    if (callManager.includes('declineTokensByCallId.remove(callId)')) {
      callManager = callManager.replace(
        'declineTokensByCallId.remove(callId)',
        'declineTokensByCallId.remove(callId.lowercase())',
      )
    }
    if (callManager.includes('nativeWebRtcBaseUrl()')) {
      callManager = callManager.replace(
        `    fun setMuted(muted: Boolean) {
        val baseUrl = nativeWebRtcBaseUrl() ?: return
        val emitter = eventEmitter ?: return
        NativeVoiceWebRtcEngine.shared(context, baseUrl, emitter).setMuted(muted)
    }`,
        `    fun setMuted(muted: Boolean) {
        val emitter = eventEmitter ?: return
        NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl(), emitter).setMuted(muted)
    }`,
      )
    }
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] native WebRTC base URL fallback + decline token keys')
  }
}

const notifyCallAnsweredNoNativeStartMarker = 'AiMediaTank defer native WebRTC to JS main thread'
const notifyCallAnsweredMainThreadMarker = 'AiMediaTank native WebRTC on main looper'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('private fun startNativeWebRtcAnswer') &&
    callManager.includes('fun notifyCallAnswered(callId: String)') &&
    !callManager.includes(notifyCallAnsweredMainThreadMarker)
  ) {
    const mainLooperStart = `        eventEmitter?.invoke("callAnswered", data)
        // ${notifyCallAnsweredMainThreadMarker}
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            startNativeWebRtcAnswer(callId, token)
        }
    }`
    if (callManager.includes(notifyCallAnsweredNoNativeStartMarker)) {
      callManager = callManager.replace(
        `        eventEmitter?.invoke("callAnswered", data)
        // ${notifyCallAnsweredNoNativeStartMarker}
    }`,
        mainLooperStart,
      )
    } else if (callManager.includes('startNativeWebRtcAnswer(callId, token)')) {
      callManager = callManager.replace(
        `        eventEmitter?.invoke("callAnswered", data)
        startNativeWebRtcAnswer(callId, token)
    }`,
        mainLooperStart,
      )
    } else {
      callManager = callManager.replace(
        `        eventEmitter?.invoke("callAnswered", data)
    }

    // AiMediaTank native WebRTC base URL fallback`,
        `        eventEmitter?.invoke("callAnswered", data)
        // ${notifyCallAnsweredMainThreadMarker}
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            startNativeWebRtcAnswer(callId, token)
        }
    }

    // AiMediaTank native WebRTC base URL fallback`,
      )
    }
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] notifyCallAnswered starts WebRTC on main looper')
  }
}

const webRtcAnswerBaseUrlFixMarker = 'callManager?.resolveWebRtcBaseUrl()'
if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (
    pluginSource.includes('fun prepareNativeWebRtcAnswer(call: PluginCall)') &&
    !pluginSource.includes(webRtcAnswerBaseUrlFixMarker)
  ) {
    pluginSource = pluginSource.replace(
      `        val token = call.getString("declineToken")
        val baseUrl = bridge.serverUrl.toString().trimEnd('/')
        NativeVoiceWebRtcEngine.shared(context, baseUrl, ::emitEvent).prepareAnswer(callId, token)`,
      `        val token = call.getString("declineToken")
        val baseUrl = callManager?.resolveWebRtcBaseUrl() ?: "https://aimediatank.com"
        NativeVoiceWebRtcEngine.shared(context, baseUrl, ::emitEvent).prepareAnswer(callId, token)`,
    )
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] prepareNativeWebRtcAnswer base URL fallback')
  }
}

const declineTokenForCallMarker = 'fun declineTokenForCall(callId: String)'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (callManager.includes('private val declineTokensByCallId') && !callManager.includes(declineTokenForCallMarker)) {
    callManager = callManager.replace(
      `    // AiMediaTank native WebRTC base URL fallback
    fun resolveWebRtcBaseUrl(): String {`,
      `    fun declineTokenForCall(callId: String): String? =
        declineTokensByCallId[callId.lowercase()]

    // AiMediaTank native WebRTC base URL fallback
    fun resolveWebRtcBaseUrl(): String {`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager declineTokenForCall')
  }
  if (!callManager.includes('data.put("declineToken", token)')) {
    callManager = callManager.replace(
      `            metadata?.getString("declineToken")?.trim()?.takeIf { it.isNotEmpty() }?.let {
                declineTokensByCallId[callId.lowercase()] = it
            }
            eventEmitter?.invoke("incomingCall", data)`,
      `            metadata?.getString("declineToken")?.trim()?.takeIf { it.isNotEmpty() }?.let { token ->
                declineTokensByCallId[callId.lowercase()] = token
                data.put("declineToken", token)
            }
            eventEmitter?.invoke("incomingCall", data)`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] incomingCall forwards declineToken to JS')
  }
}

const webRtcAnswerTokenFallbackMarker = 'declineTokenForCall(callId)'
if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (
    pluginSource.includes('fun prepareNativeWebRtcAnswer(call: PluginCall)') &&
    !pluginSource.includes(webRtcAnswerTokenFallbackMarker)
  ) {
    pluginSource = pluginSource.replace(
      `        val token = call.getString("declineToken")
        val baseUrl = callManager?.resolveWebRtcBaseUrl() ?: "https://aimediatank.com"`,
      `        val token = call.getString("declineToken") ?: callManager?.declineTokenForCall(callId)
        val baseUrl = callManager?.resolveWebRtcBaseUrl() ?: "https://aimediatank.com"`,
    )
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] prepareNativeWebRtcAnswer FCM token fallback')
  }
}

const answerCallFallbackMarker = 'AiMediaTank in-app accept fallback when Telecom connection missing'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('fun answerCall(callId: String)') &&
    !callManager.includes(answerCallFallbackMarker)
  ) {
    if (callManager.includes('setVoiceCallAudioActive(true)\n        activeCalls[callId]?.onAnswer()')) {
      callManager = callManager.replace(
        `    fun answerCall(callId: String) {
        setVoiceCallAudioActive(true)
        activeCalls[callId]?.onAnswer()
    }`,
        `    fun answerCall(callId: String) {
        setVoiceCallAudioActive(true)
        val normalized = callId.lowercase()
        val connection = activeCalls[callId]
            ?: activeCalls.entries.firstOrNull { it.key.lowercase() == normalized }?.value
        if (connection != null) {
            connection.onAnswer()
        } else {
            // ${answerCallFallbackMarker}
            notifyCallAnswered(callId)
        }
    }`,
      )
    } else {
      callManager = callManager.replace(
        `    fun answerCall(callId: String) {
        activeCalls[callId]?.onAnswer()
    }`,
        `    fun answerCall(callId: String) {
        setVoiceCallAudioActive(true)
        val normalized = callId.lowercase()
        val connection = activeCalls[callId]
            ?: activeCalls.entries.firstOrNull { it.key.lowercase() == normalized }?.value
        if (connection != null) {
            connection.onAnswer()
        } else {
            // ${answerCallFallbackMarker}
            notifyCallAnswered(callId)
        }
    }`,
      )
    }
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager answerCall fallback when no Telecom connection')
  }
}

const notifySkipNativeWebRtcMarker = 'AiMediaTank skip duplicate native WebRTC start'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('fun notifyCallAnswered(callId: String)') &&
    !callManager.includes(notifySkipNativeWebRtcMarker)
  ) {
    callManager = callManager.replace(
      `        eventEmitter?.invoke("callAnswered", data)
        // AiMediaTank native WebRTC on main looper
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            startNativeWebRtcAnswer(callId, token)
        }
    }`,
      `        eventEmitter?.invoke("callAnswered", data)
        // ${notifySkipNativeWebRtcMarker}
        val emitter = eventEmitter ?: return
        val engine = NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl(), emitter)
        if (!engine.isHandlingCall(callId)) {
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                startNativeWebRtcAnswer(callId, token)
            }
        }
    }`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] notifyCallAnswered skips duplicate native WebRTC')
  }
}

// WebView video: answer Telecom / dismiss "Incoming call" without a second native PeerConnection.
const webOwnsVideoSkipMarker = 'AiMediaTank skip native WebRTC when WebView owns video'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes(notifySkipNativeWebRtcMarker) &&
    !callManager.includes(webOwnsVideoSkipMarker)
  ) {
    const upgraded = callManager.replace(
      `        // ${notifySkipNativeWebRtcMarker}
        val emitter = eventEmitter ?: return
        val engine = NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl(), emitter)
        if (!engine.isHandlingCall(callId)) {
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                startNativeWebRtcAnswer(callId, token)
            }
        }`,
      `        // ${notifySkipNativeWebRtcMarker}
        // ${webOwnsVideoSkipMarker}
        val webOwnsVideo = context.getSharedPreferences("amt_voice", android.content.Context.MODE_PRIVATE)
            .getBoolean("web_video_" + callId.lowercase(), false)
        if (webOwnsVideo) {
            try { IncomingCallUiHelper.dismiss(context) } catch (_: Exception) {}
            return
        }
        val emitter = eventEmitter ?: return
        val engine = NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl(), emitter)
        if (!engine.isHandlingCall(callId)) {
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                startNativeWebRtcAnswer(callId, token)
            }
        }`,
    )
    if (upgraded !== callManager) {
      fs.writeFileSync(callManagerPath, upgraded)
      changed = true
      console.log('[patch-android-fcm] notifyCallAnswered skips WebView-owned video')
    }
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('fun resolveWebRtcBaseUrl()') &&
    !callManager.includes('fun markWebOwnsVideoCall(')
  ) {
    callManager = callManager.replace(
      `    fun resolveWebRtcBaseUrl(): String {`,
      `    fun markWebOwnsVideoCall(callId: String) {
        context.getSharedPreferences("amt_voice", android.content.Context.MODE_PRIVATE)
            .edit()
            .putBoolean("web_video_" + callId.lowercase(), true)
            .apply()
        try { IncomingCallUiHelper.dismiss(context) } catch (_: Exception) {}
    }

    fun clearWebOwnsVideoCall(callId: String) {
        context.getSharedPreferences("amt_voice", android.content.Context.MODE_PRIVATE)
            .edit()
            .remove("web_video_" + callId.lowercase())
            .apply()
    }

    fun resolveWebRtcBaseUrl(): String {`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager markWebOwnsVideoCall')
  }
}

if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (
    pluginSource.includes('fun prepareNativeWebRtcAnswer(call: PluginCall)') &&
    !pluginSource.includes('fun markWebOwnsVideoCall(call: PluginCall)')
  ) {
    pluginSource = pluginSource.replace(
      `    @PluginMethod
    fun prepareNativeWebRtcAnswer(call: PluginCall) {`,
      `    @PluginMethod
    fun markWebOwnsVideoCall(call: PluginCall) {
        val callId = call.getString("callId") ?: run {
            call.reject("Missing callId")
            return
        }
        callManager?.markWebOwnsVideoCall(callId)
        call.resolve()
    }

    @PluginMethod
    fun prepareNativeWebRtcAnswer(call: PluginCall) {`,
    )
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] markWebOwnsVideoCall plugin method')
  }
}

const remoteOfferSdpMarker = 'remoteOfferSdp'
if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (
    pluginSource.includes('fun prepareNativeWebRtcAnswer(call: PluginCall)') &&
    !pluginSource.includes(remoteOfferSdpMarker)
  ) {
    pluginSource = pluginSource.replace(
      `        val token = call.getString("declineToken") ?: callManager?.declineTokenForCall(callId)
        val baseUrl = callManager?.resolveWebRtcBaseUrl() ?: "https://aimediatank.com"
        NativeVoiceWebRtcEngine.shared(context, baseUrl, ::emitEvent).prepareAnswer(callId, token)
        call.resolve()`,
      `        val token = call.getString("declineToken") ?: callManager?.declineTokenForCall(callId)
        val remoteOfferSdp = call.getString("remoteOfferSdp")
        val hasVideo = call.getBoolean("hasVideo", false) ?: false
        val baseUrl = callManager?.resolveWebRtcBaseUrl() ?: "https://aimediatank.com"
        NativeVoiceWebRtcEngine.shared(context, baseUrl, ::emitEvent).prepareAnswer(callId, token, remoteOfferSdp, hasVideo)
        call.resolve()`,
    )
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] prepareNativeWebRtcAnswer accepts remoteOfferSdp')
  }
}

const incomingCallDedupMarker = 'AiMediaTank skip duplicate incoming call'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('fun reportIncomingCall(') &&
    !callManager.includes(incomingCallDedupMarker)
  ) {
    callManager = callManager.replace(
      `    private val activeCalls = mutableMapOf<String, VoipConnection>()
    private val declineTokensByCallId = mutableMapOf<String, String>()`,
      `    private val activeCalls = mutableMapOf<String, VoipConnection>()
    private val declineTokensByCallId = mutableMapOf<String, String>()
    private val reportedIncomingCallIds = mutableSetOf<String>()`,
    )
    callManager = callManager.replace(
      `    fun reportIncomingCall(
        callId: String,
        handle: String,
        displayName: String,
        handleType: String,
        video: Boolean,
        metadata: JSObject?
    ) {
        val phoneAccount = VoipConnectionService.getPhoneAccount(context)`,
      `    fun reportIncomingCall(
        callId: String,
        handle: String,
        displayName: String,
        handleType: String,
        video: Boolean,
        metadata: JSObject?
    ) {
        val normalized = callId.lowercase()
        if (reportedIncomingCallIds.contains(normalized)) {
            // ${incomingCallDedupMarker}
            android.util.Log.i("CallManager", "skip duplicate incoming callId=$callId")
            metadata?.getString("declineToken")?.trim()?.takeIf { it.isNotEmpty() }?.let {
                declineTokensByCallId[normalized] = it
            }
            return
        }
        reportedIncomingCallIds.add(normalized)
        val phoneAccount = VoipConnectionService.getPhoneAccount(context)`,
    )
    callManager = callManager.replace(
      `        declineTokensByCallId.remove(callId.lowercase())
        endNativeWebRtc()`,
      `        declineTokensByCallId.remove(callId.lowercase())
        reportedIncomingCallIds.remove(callId.lowercase())
        endNativeWebRtc()`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager dedup incoming call reports')
  }
}

const callManagerCompanionDedupMarker = 'AiMediaTank process-wide incoming dedup'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('private val reportedIncomingCallIds') &&
    !callManager.includes(callManagerCompanionDedupMarker)
  ) {
    callManager = callManager.replace(
      `    private val reportedIncomingCallIds = mutableSetOf<String>()
    // AiMediaTank Android native WebRTC`,
      `    // ${callManagerCompanionDedupMarker}
    // AiMediaTank Android native WebRTC`,
    )
    callManager = callManager.replace(
      `) {
    private val telecomManager: TelecomManager? =`,
      `) {
    companion object {
        private val reportedIncomingCallIds = mutableSetOf<String>()
    }

    private val telecomManager: TelecomManager? =`,
    )
    callManager = callManager.replace(
      `        val normalized = callId.lowercase()
        if (reportedIncomingCallIds.contains(normalized)) {`,
      `        val normalized = callId.lowercase()
        if (NativeVoiceWebRtcEngine.isHandlingCallId(callId)) {
            android.util.Log.i("CallManager", "skip incoming during native WebRTC callId=$callId")
            metadata?.getString("declineToken")?.trim()?.takeIf { it.isNotEmpty() }?.let {
                declineTokensByCallId[normalized] = it
            }
            return
        }
        if (reportedIncomingCallIds.contains(normalized)) {`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager process-wide incoming dedup')
  }
}

const fcmPluginCallManagerMarker = 'CapacitorVoipCallsPlugin.getInstance()?.callManager'
if (fs.existsSync(messagingServicePath)) {
  let pushRouter = fs.readFileSync(messagingServicePath, 'utf8')
  if (pushRouter.includes('val manager = CallManager(context)') && !pushRouter.includes(fcmPluginCallManagerMarker)) {
    pushRouter = pushRouter.replaceAll(
      'val manager = CallManager(context)',
      'val manager = CapacitorVoipCallsPlugin.getInstance()?.callManager ?: CallManager(context)',
    )
    fs.writeFileSync(messagingServicePath, pushRouter)
    changed = true
    console.log('[patch-android-fcm] FCM incoming uses plugin CallManager singleton')
  }
}

const voiceCallLoudnessMaxMarker = 'AiMediaTank voice call loudness max'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (callManager.includes('voiceCallLoudnessBoostMb = 800') && !callManager.includes(voiceCallLoudnessMaxMarker)) {
    callManager = callManager.replace(
      'private val voiceCallLoudnessBoostMb = 800',
      `// ${voiceCallLoudnessMaxMarker}
    private val voiceCallLoudnessBoostMb = 1000`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager voice call loudness max 1000mb')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (callManager.includes(voiceCallCommunicationModeMarker) && !callManager.includes(voiceCallRingLoudnessModeMarker)) {
    callManager = callManager.replace(
      `            // ${voiceCallCommunicationModeMarker}
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION`,
      `            // ${voiceCallCommunicationModeMarker}
            // ${voiceCallRingLoudnessModeMarker}
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_NORMAL`,
    )
    callManager = callManager.replace(
      `        val stream = if (voiceCallAudioActive) {
            AudioManager.STREAM_VOICE_CALL
        } else {
            AudioManager.STREAM_MUSIC
        }`,
      `        val stream = if (voiceCallAudioActive) {
            AudioManager.STREAM_MUSIC
        } else {
            AudioManager.STREAM_MUSIC
        }`,
    )
    callManager = callManager.replace(
      `                val attrs = android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION)
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
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN
                )
            }
            enableVoiceCallLoudnessBoost()`,
      `                val attrs = android.media.AudioAttributes.Builder()
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
            enableVoiceCallLoudnessBoost()`,
    )
    callManager = callManager.replace(
      /\n    fun setVoiceCallMediaVolume\(level: Float\) \{[\s\S]*?\n    \}\n\n    private fun notifyError/,
      `
    fun setVoiceCallMediaVolume(level: Float) {
        // ${voiceCallMediaVolumeLevelMarker}
        // ${voiceCallRingLoudnessModeMarker}
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val clamped = level.coerceIn(0f, 1f)
        val ringMax = audioManager.getStreamMaxVolume(AudioManager.STREAM_RING)
        val ringFraction = if (ringMax > 0) {
            audioManager.getStreamVolume(AudioManager.STREAM_RING).toFloat() / ringMax.toFloat()
        } else {
            1f
        }
        val targetFraction = kotlin.math.max(clamped, ringFraction)
        val streams = intArrayOf(AudioManager.STREAM_MUSIC, AudioManager.STREAM_VOICE_CALL)
        if (clamped <= 0f) {
            for (stream in streams) {
                audioManager.setStreamVolume(stream, 0, 0)
            }
            reapplyVolumeControlStream()
            return
        }
        for (stream in streams) {
            val max = audioManager.getStreamMaxVolume(stream)
            if (max <= 0) continue
            val target = (max * targetFraction).toInt().coerceIn(1, max)
            audioManager.setStreamVolume(stream, target, 0)
        }
        enableVoiceCallLoudnessBoost()
        reapplyVolumeControlStream()
    }

    private fun notifyError`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager voice call ring loudness mode')
  }
}

const voiceCallTelecomSpeakerMarker = 'AiMediaTank telecom managed speaker route'
const voipTelecomSpeakerMarker = 'AiMediaTank telecom speaker route'
const voipTelecomSpeakerLegacyMarker = 'AiMediaTank telecom speaker legacy route'
if (fs.existsSync(voipConnectionPath)) {
  let voipConnection = fs.readFileSync(voipConnectionPath, 'utf8')
  if (
    voipConnection.includes(voipTelecomSpeakerMarker) &&
    voipConnection.includes('currentCallEndpoints') &&
    !voipConnection.includes(voipTelecomSpeakerLegacyMarker)
  ) {
    voipConnection = voipConnection.replace(
      /    fun requestSpeakerRoute\(\) \{[\s\S]*?    fun requestEarpieceRoute\(\) \{/,
      `    fun requestSpeakerRoute() {
        // ${voipTelecomSpeakerMarker}
        // ${voipTelecomSpeakerLegacyMarker}
        routeSpeakerLegacy()
    }

    private fun routeSpeakerLegacy() {
        @Suppress("DEPRECATION")
        setAudioRoute(CallAudioState.ROUTE_SPEAKER)
        android.util.Log.i("VoipConnection", "telecom speaker callId=$callId")
    }

    fun requestEarpieceRoute() {`,
    )
    voipConnection = voipConnection.replace(
      `import android.telecom.CallEndpoint
import android.telecom.Connection
import android.telecom.CallEndpointException
import android.os.OutcomeReceiver
import androidx.core.content.ContextCompat
`,
      `import android.telecom.Connection
`,
    )
    fs.writeFileSync(voipConnectionPath, voipConnection)
    changed = true
    console.log('[patch-android-fcm] VoipConnection legacy telecom speaker route')
  }
}

if (fs.existsSync(voipConnectionPath)) {
  let voipConnection = fs.readFileSync(voipConnectionPath, 'utf8')
  if (!voipConnection.includes(voipTelecomSpeakerMarker)) {
    if (!voipConnection.includes('import android.telecom.CallAudioState')) {
      voipConnection = voipConnection.replace(
        'import android.telecom.Connection',
        `import android.telecom.CallAudioState
import android.telecom.Connection`,
      )
    }
    voipConnection = voipConnection.replace(
      `        setConnectionProperties(PROPERTY_SELF_MANAGED)

        if (video) {`,
      `        setConnectionProperties(PROPERTY_SELF_MANAGED)
        setAudioModeIsVoip(true)

        if (video) {`,
    )
    voipConnection = voipConnection.replace(
      `    override fun onShowIncomingCallUi() {`,
      `    fun requestSpeakerRoute() {
        // ${voipTelecomSpeakerMarker}
        // ${voipTelecomSpeakerLegacyMarker}
        routeSpeakerLegacy()
    }

    private fun routeSpeakerLegacy() {
        @Suppress("DEPRECATION")
        setAudioRoute(CallAudioState.ROUTE_SPEAKER)
        android.util.Log.i("VoipConnection", "telecom speaker callId=$callId")
    }

    fun requestEarpieceRoute() {
        @Suppress("DEPRECATION")
        setAudioRoute(CallAudioState.ROUTE_EARPIECE)
    }

    override fun onShowIncomingCallUi() {`,
    )
    voipConnection = voipConnection.replace(
      `    override fun onAnswer() {
        setActive()
        callManager?.notifyCallAnswered(callId)
    }`,
      `    override fun onAnswer() {
        setActive()
        requestSpeakerRoute()
        callManager?.notifyCallAnswered(callId)
    }`,
    )
    voipConnection = voipConnection.replace(
      `    override fun onAnswer(videoState: Int) {
        setActive()
        setVideoState(videoState)
        callManager?.notifyCallAnswered(callId)
    }`,
      `    override fun onAnswer(videoState: Int) {
        setActive()
        setVideoState(videoState)
        requestSpeakerRoute()
        callManager?.notifyCallAnswered(callId)
    }`,
    )
    voipConnection = voipConnection.replace(
      `            STATE_ACTIVE -> {
                // Call is now active
            }`,
      `            STATE_ACTIVE -> {
                requestSpeakerRoute()
            }`,
    )
    fs.writeFileSync(voipConnectionPath, voipConnection)
    changed = true
    console.log('[patch-android-fcm] VoipConnection telecom speaker route')
  }
}

if (fs.existsSync(voipConnectionPath)) {
  let voipConnection = fs.readFileSync(voipConnectionPath, 'utf8')
  if (
    voipConnection.includes('fun requestSpeakerRoute()') &&
    !voipConnection.includes('preferredAudioRoute == "earpiece"')
  ) {
    voipConnection = voipConnection.replace(
      `    fun requestSpeakerRoute() {
        // ${voipTelecomSpeakerMarker}
        // ${voipTelecomSpeakerLegacyMarker}
        routeSpeakerLegacy()
    }`,
      `    fun requestSpeakerRoute() {
        // ${voipTelecomSpeakerMarker}
        // ${voipTelecomSpeakerLegacyMarker}
        // Honor JS / in-call Speaker OFF — do not re-force loudspeaker.
        if (callManager?.preferredAudioRoute == "earpiece") {
            requestEarpieceRoute()
            return
        }
        routeSpeakerLegacy()
    }`,
    )
    fs.writeFileSync(voipConnectionPath, voipConnection)
    changed = true
    console.log('[patch-android-fcm] VoipConnection respects preferredAudioRoute earpiece')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (callManager.includes(voiceCallRingLoudnessModeMarker) && !callManager.includes(voiceCallTelecomSpeakerMarker)) {
    callManager = callManager.replace(
      `            // ${voiceCallCommunicationModeMarker}
            // ${voiceCallRingLoudnessModeMarker}
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_NORMAL`,
      `            // ${voiceCallCommunicationModeMarker}
            // ${voiceCallTelecomSpeakerMarker}
            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION`,
    )
    callManager = callManager.replace(
      `        val stream = if (voiceCallAudioActive) {
            AudioManager.STREAM_MUSIC
        } else {
            AudioManager.STREAM_MUSIC
        }`,
      `        val stream = if (voiceCallAudioActive) {
            AudioManager.STREAM_VOICE_CALL
        } else {
            AudioManager.STREAM_MUSIC
        }`,
    )
    callManager = callManager.replace(
      `.setUsage(android.media.AudioAttributes.USAGE_MEDIA)
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
            enableVoiceCallLoudnessBoost()`,
      `.setUsage(android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION)
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
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN
                )
            }
            applyTelecomSpeakerRoute()`,
    )
    callManager = callManager.replace(
      /\n    fun setVoiceCallMediaVolume\(level: Float\) \{[\s\S]*?\n    \}\n\n    private fun notifyError/,
      `
    fun setVoiceCallMediaVolume(level: Float) {
        // ${voiceCallMediaVolumeLevelMarker}
        // ${voiceCallTelecomSpeakerMarker}
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val clamped = level.coerceIn(0f, 1f)
        val streams = intArrayOf(AudioManager.STREAM_VOICE_CALL, AudioManager.STREAM_MUSIC)
        if (clamped <= 0f) {
            for (stream in streams) {
                audioManager.setStreamVolume(stream, 0, 0)
            }
            reapplyVolumeControlStream()
            return
        }
        val ringMax = audioManager.getStreamMaxVolume(AudioManager.STREAM_RING)
        val ringFraction = if (ringMax > 0) {
            audioManager.getStreamVolume(AudioManager.STREAM_RING).toFloat() / ringMax.toFloat()
        } else {
            1f
        }
        val targetFraction = kotlin.math.max(clamped, ringFraction)
        for (stream in streams) {
            val max = audioManager.getStreamMaxVolume(stream)
            if (max <= 0) continue
            val target = (max * targetFraction).toInt().coerceIn(1, max)
            audioManager.setStreamVolume(stream, target, 0)
        }
        enableVoiceCallLoudnessBoost()
        reapplyVolumeControlStream()
    }

    private fun notifyError`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager revert ring loudness mode to telecom speaker')
  }

  callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (!callManager.includes('fun applyTelecomSpeakerRoute()')) {
    callManager = callManager.replace(
      `    fun setAudioRoute(route: String) {
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        
        when (route) {
            "speaker" -> {
                audioManager.isSpeakerphoneOn = true
            }
            "earpiece" -> {
                audioManager.isSpeakerphoneOn = false
            }
            "bluetooth" -> {
                // Bluetooth routing is handled automatically when connected
                audioManager.isBluetoothScoOn = true
                audioManager.startBluetoothSco()
            }
        }
    }`,
      `    fun applyTelecomSpeakerRoute() {
        // ${voiceCallTelecomSpeakerMarker}
        preferredAudioRoute = "speaker"
        var telecomRouted = false
        for (connection in activeCalls.values) {
            connection.requestSpeakerRoute()
            telecomRouted = true
        }
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        if (!telecomRouted) {
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    val speaker = audioManager.availableCommunicationDevices
                        .firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
                    if (speaker != null) {
                        audioManager.setCommunicationDevice(speaker)
                    }
                } catch (_: Exception) {
                }
            }
        }
        setVoiceCallMediaVolume(1.0f)
        android.util.Log.i(
            "CallManager",
            "telecom speaker route connections=\${activeCalls.size} telecom=\$telecomRouted",
        )
    }

    fun applyTelecomEarpieceRoute() {
        preferredAudioRoute = "earpiece"
        for (connection in activeCalls.values) {
            connection.requestEarpieceRoute()
        }
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val earpiece = audioManager.availableCommunicationDevices
                    .firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }
                if (earpiece != null) {
                    audioManager.setCommunicationDevice(earpiece)
                } else {
                    audioManager.clearCommunicationDevice()
                }
            } catch (_: Exception) {
            }
        }
        android.util.Log.i("CallManager", "telecom earpiece route connections=\${activeCalls.size}")
    }

    fun setAudioRoute(route: String) {
        when (route) {
            "speaker" -> applyTelecomSpeakerRoute()
            "earpiece" -> applyTelecomEarpieceRoute()
            "bluetooth" -> {
                val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                audioManager.isBluetoothScoOn = true
                @Suppress("DEPRECATION")
                audioManager.startBluetoothSco()
            }
        }
    }`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager applyTelecomSpeakerRoute')
  }

  // Always declare the field if methods assign it (fresh inject added assignments first).
  callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('preferredAudioRoute') &&
    !callManager.includes('var preferredAudioRoute')
  ) {
    const activeCallsDecl =
      'private val activeCalls = mutableMapOf<String, VoipConnection>()'
    if (callManager.includes(activeCallsDecl)) {
      callManager = callManager.replace(
        activeCallsDecl,
        `@Volatile\n    var preferredAudioRoute: String = "speaker"\n\n    ${activeCallsDecl}`,
      )
    } else if (callManager.includes('private val activeCalls')) {
      callManager = callManager.replace(
        'private val activeCalls',
        '@Volatile\n    var preferredAudioRoute: String = "speaker"\n\n    private val activeCalls',
      )
    }
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager declare preferredAudioRoute field')
  }

  // Earpiece OFF must select TYPE_BUILTIN_EARPIECE — clearCommunicationDevice alone often stays on speaker.
  callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('fun applyTelecomEarpieceRoute()') &&
    !callManager.includes('preferredAudioRoute')
  ) {
    // Insert preference field near class members if missing.
    if (callManager.includes('private val activeCalls')) {
      callManager = callManager.replace(
        'private val activeCalls',
        '@Volatile\n    var preferredAudioRoute: String = "speaker"\n\n    private val activeCalls',
      )
    }
    if (
      callManager.includes('fun applyTelecomSpeakerRoute()') &&
      !callManager.includes('preferredAudioRoute = "speaker"')
    ) {
      callManager = callManager.replace(
        `    fun applyTelecomSpeakerRoute() {
        // ${voiceCallTelecomSpeakerMarker}
        var telecomRouted = false`,
        `    fun applyTelecomSpeakerRoute() {
        // ${voiceCallTelecomSpeakerMarker}
        preferredAudioRoute = "speaker"
        var telecomRouted = false`,
      )
    }
    if (
      callManager.includes('fun applyTelecomEarpieceRoute()') &&
      !callManager.includes('preferredAudioRoute = "earpiece"')
    ) {
      callManager = callManager.replace(
        `    fun applyTelecomEarpieceRoute() {
        for (connection in activeCalls.values) {
            connection.requestEarpieceRoute()
        }`,
        `    fun applyTelecomEarpieceRoute() {
        preferredAudioRoute = "earpiece"
        for (connection in activeCalls.values) {
            connection.requestEarpieceRoute()
        }`,
      )
    }
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager preferredAudioRoute preference')
  }

  callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('fun applyTelecomEarpieceRoute()') &&
    !callManager.includes('TYPE_BUILTIN_EARPIECE')
  ) {
    // Match either legacy (clear only) or assignment-prefixed earpiece body.
    const earpieceLegacy = `    fun applyTelecomEarpieceRoute() {
        for (connection in activeCalls.values) {
            connection.requestEarpieceRoute()
        }
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                audioManager.clearCommunicationDevice()
            } catch (_: Exception) {
            }
        }
    }`
    const earpieceWithPref = `    fun applyTelecomEarpieceRoute() {
        preferredAudioRoute = "earpiece"
        for (connection in activeCalls.values) {
            connection.requestEarpieceRoute()
        }
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                audioManager.clearCommunicationDevice()
            } catch (_: Exception) {
            }
        }
    }`
    const earpieceFixed = `    fun applyTelecomEarpieceRoute() {
        preferredAudioRoute = "earpiece"
        for (connection in activeCalls.values) {
            connection.requestEarpieceRoute()
        }
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = false
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val earpiece = audioManager.availableCommunicationDevices
                    .firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }
                if (earpiece != null) {
                    audioManager.setCommunicationDevice(earpiece)
                } else {
                    audioManager.clearCommunicationDevice()
                }
            } catch (_: Exception) {
            }
        }
        android.util.Log.i("CallManager", "telecom earpiece route connections=\${activeCalls.size}")
    }`
    if (callManager.includes(earpieceWithPref)) {
      callManager = callManager.replace(earpieceWithPref, earpieceFixed)
    } else if (callManager.includes(earpieceLegacy)) {
      callManager = callManager.replace(earpieceLegacy, earpieceFixed)
    }
    if (callManager.includes('TYPE_BUILTIN_EARPIECE')) {
      fs.writeFileSync(callManagerPath, callManager)
      changed = true
      console.log('[patch-android-fcm] CallManager earpiece uses TYPE_BUILTIN_EARPIECE')
    }
  }

  callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('enableVoiceCallLoudnessBoost()') &&
    callManager.includes('fun setVoiceCallAudioActive(active: Boolean)') &&
    !callManager.includes(`${voiceCallTelecomSpeakerMarker}\n            return`)
  ) {
    callManager = callManager.replace(
      `            enableVoiceCallLoudnessBoost()
            return
        }
        releaseGlobalAudioSideEffects()
    }

    fun setVoiceCallMediaVolume(level: Float) {`,
      `            applyTelecomSpeakerRoute()
            return
        }
        releaseGlobalAudioSideEffects()
    }

    fun setVoiceCallMediaVolume(level: Float) {`,
    )
    callManager = callManager.replace(
      `        enableVoiceCallLoudnessBoost()
        reapplyVolumeControlStream()
    }

    private fun notifyError`,
      `        reapplyVolumeControlStream()
    }

    private fun notifyError`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager drop in-call LoudnessEnhancer')
  }

  callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('fun reapplyVolumeControlStream()') &&
    callManager.includes('voiceCallAudioActive) {\n            AudioManager.STREAM_MUSIC') &&
    !callManager.includes(`${voiceCallTelecomSpeakerMarker}\n        resolveVolumeActivity`)
  ) {
    callManager = callManager.replace(
      `        val stream = if (voiceCallAudioActive) {
            AudioManager.STREAM_MUSIC
        } else {
            AudioManager.STREAM_MUSIC
        }
        resolveVolumeActivity()?.volumeControlStream = stream`,
      `        val stream = if (voiceCallAudioActive) {
            AudioManager.STREAM_VOICE_CALL
        } else {
            AudioManager.STREAM_MUSIC
        }
        // ${voiceCallTelecomSpeakerMarker}
        resolveVolumeActivity()?.volumeControlStream = stream`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager voice volume keys STREAM_VOICE_CALL')
  }

  callManager = fs.readFileSync(callManagerPath, 'utf8')
  const loudnessAfterMediaVolumeMarker = 'AiMediaTank loudness boost after media volume'
  if (
    callManager.includes('fun setVoiceCallMediaVolume(level: Float)') &&
    callManager.includes(voiceCallTelecomSpeakerMarker) &&
    !callManager.includes(loudnessAfterMediaVolumeMarker)
  ) {
    callManager = callManager.replace(
      `        for (stream in streams) {
            val max = audioManager.getStreamMaxVolume(stream)
            if (max <= 0) continue
            val target = (max * targetFraction).toInt().coerceIn(1, max)
            audioManager.setStreamVolume(stream, target, 0)
        }
        reapplyVolumeControlStream()
    }

    private fun notifyError`,
      `        for (stream in streams) {
            val max = audioManager.getStreamMaxVolume(stream)
            if (max <= 0) continue
            val target = (max * targetFraction).toInt().coerceIn(1, max)
            audioManager.setStreamVolume(stream, target, 0)
        }
        // ${loudnessAfterMediaVolumeMarker}
        enableVoiceCallLoudnessBoost()
        reapplyVolumeControlStream()
    }

    private fun notifyError`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager restore loudness boost on media volume')
  }
}

const pstnSafeAudioCleanupMarker = 'clear communication device for PSTN'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('fun releaseGlobalAudioSideEffects()') &&
    !callManager.includes(pstnSafeAudioCleanupMarker)
  ) {
    callManager = callManager.replace(
      `        try {
            @Suppress("DEPRECATION")
            audioManager.stopBluetoothSco()
            audioManager.isBluetoothScoOn = false
        } catch (_: Exception) {
        }
        if (audioManager.mode != AudioManager.MODE_NORMAL) {
            audioManager.mode = AudioManager.MODE_NORMAL
        }
        releaseVoiceCallLoudnessBoost()`,
      `        try {
            @Suppress("DEPRECATION")
            audioManager.stopBluetoothSco()
            audioManager.isBluetoothScoOn = false
        } catch (_: Exception) {
        }
        // ${pstnSafeAudioCleanupMarker}
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                audioManager.clearCommunicationDevice()
            } catch (_: Exception) {
            }
        }
        if (audioManager.mode != AudioManager.MODE_NORMAL) {
            audioManager.mode = AudioManager.MODE_NORMAL
        }
        releaseVoiceCallLoudnessBoost()`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager clear communication device on audio release')
  }
}

const pstnMediaVolumeMarker = 'PSTN-safe media volume STREAM_MUSIC only'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('fun setVoiceCallMediaVolume(level: Float)') &&
    callManager.includes('AudioManager.STREAM_VOICE_CALL') &&
    !callManager.includes(pstnMediaVolumeMarker)
  ) {
    callManager = callManager.replace(
      `        val streams = intArrayOf(AudioManager.STREAM_MUSIC, AudioManager.STREAM_VOICE_CALL)`,
      `        // ${pstnMediaVolumeMarker}
        val streams = intArrayOf(AudioManager.STREAM_MUSIC)`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager avoid STREAM_VOICE_CALL volume (PSTN safe)')
  }
}

const purgeOrphanTelecomMarker = 'purge orphan telecom for PSTN'
const neverPurgeRingingMarker = 'never purge ringing telecom'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('fun releaseIfStale()') &&
    !callManager.includes(neverPurgeRingingMarker)
  ) {
    const before = callManager
    callManager = callManager.replace(
      `    fun releaseIfStale() {
        if (activeCalls.isEmpty() && !IncomingRingAudioHelper.isActive() && voiceCallAudioActive) {
            setVoiceCallAudioActive(false)
        }
    }`,
      `    fun releaseIfStale() {
        // ${neverPurgeRingingMarker} — ConnectionService rings before WebRTC starts
        if (IncomingRingAudioHelper.isActive()) return
        if (IncomingAnnouncementHelper.isActive()) return
        if (activeCalls.isNotEmpty()) return
        if (voiceCallAudioActive) {
            setVoiceCallAudioActive(false)
        }
    }`,
    )
    if (callManager.includes(purgeOrphanTelecomMarker)) {
      callManager = callManager.replace(
        /    fun releaseIfStale\(\) \{[\s\S]*?\n    \}\n\n    fun releaseGlobalAudioSideEffects/,
        `    fun releaseIfStale() {
        // ${neverPurgeRingingMarker} — ConnectionService rings before WebRTC starts
        if (IncomingRingAudioHelper.isActive()) return
        if (IncomingAnnouncementHelper.isActive()) return
        if (activeCalls.isNotEmpty()) return
        if (voiceCallAudioActive) {
            setVoiceCallAudioActive(false)
        }
    }

    fun releaseGlobalAudioSideEffects`,
      )
    }
    if (callManager !== before && callManager.includes(neverPurgeRingingMarker)) {
      fs.writeFileSync(callManagerPath, callManager)
      changed = true
      console.log('[patch-android-fcm] CallManager never purge ringing telecom')
    }
  }
}

if (fs.existsSync(androidAudioCleanupPath)) {
  let cleanup = fs.readFileSync(androidAudioCleanupPath, 'utf8')
  if (!cleanup.includes(pstnSafeAudioCleanupMarker)) {
    cleanup = cleanup.replace(
      `import android.content.Context
import android.media.AudioManager
import android.util.Log`,
      `import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.util.Log`,
    )
    cleanup = cleanup.replace(
      `            am.isBluetoothScoOn = false
        } catch (e: Exception) {
            Log.w(TAG, "speaker/bluetooth reset skipped", e)
        }
        if (am.mode != AudioManager.MODE_NORMAL) {
            am.mode = AudioManager.MODE_NORMAL
        }`,
      `            am.isBluetoothScoOn = false
        } catch (e: Exception) {
            Log.w(TAG, "speaker/bluetooth reset skipped", e)
        }
        // ${pstnSafeAudioCleanupMarker}
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                am.clearCommunicationDevice()
            } catch (e: Exception) {
                Log.w(TAG, "clearCommunicationDevice skipped", e)
            }
        }
        if (am.mode != AudioManager.MODE_NORMAL) {
            am.mode = AudioManager.MODE_NORMAL
        }`,
    )
    fs.writeFileSync(androidAudioCleanupPath, cleanup)
    changed = true
    console.log('[patch-android-fcm] AndroidAudioCleanup clear communication device')
  }
}

const systemEffectsContainmentMarker = 'AiMediaTank system effects containment'
const appSystemEffectsGuardSource = `package com.capacitor.voipcalls

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Containment: global AudioManager / window flags must never leak outside an app voice-call session.
 * PSTN and other phone functions take priority when no active AiMediaTank call is running.
 */
object AppSystemEffectsGuard {
    // ${systemEffectsContainmentMarker}
    private const val TAG = "AppSystemEffectsGuard"
    private const val WATCHDOG_MS = 45_000L
    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile private var pstnListenerInstalled = false
    @Volatile private var watchdogInstalled = false

    @JvmStatic
    fun isAppCallSessionActive(context: Context): Boolean {
        if (IncomingRingAudioHelper.isActive()) return true
        try {
            val manager = CapacitorVoipCallsPlugin.getInstance()?.callManager
            if (manager != null && manager.hasActiveAppCallSession()) return true
        } catch (_: Exception) {
        }
        return try {
            val baseUrl = CapacitorVoipCallsPlugin.getInstance()?.callManager?.resolveWebRtcBaseUrl()
                ?: "https://aimediatank.com"
            NativeVoiceWebRtcEngine.shared(context.applicationContext, baseUrl) { _, _ -> }.isActive()
        } catch (_: Exception) {
            false
        }
    }

    @JvmStatic
    fun enforceContainment(context: Context, reason: String) {
        val appContext = context.applicationContext
        try {
            CapacitorVoipCallsPlugin.getInstance()?.callManager?.releaseIfStale()
        } catch (_: Exception) {
        }
        if (isAppCallSessionActive(appContext)) {
            Log.d(TAG, "skip enforce ($reason) — app call session active")
            return
        }
        Log.i(TAG, "enforce containment ($reason)")
        CallVolumeState.voiceCallActive = false
        CallVolumeState.ringActive = false
        try {
            CapacitorVoipCallsPlugin.getInstance()?.callManager?.forceReleaseGlobalAudio()
        } catch (_: Exception) {
            AndroidAudioCleanup.releaseGlobalAudioRouting(appContext)
        }
        resolveActivity(appContext)?.let { activity ->
            CallScreenPresentation.clear(activity)
        }
    }

    @JvmStatic
    fun install(context: Context) {
        val appContext = context.applicationContext
        installPstnListener(appContext)
        installWatchdog(appContext)
    }

    private fun resolveActivity(context: Context): Activity? {
        return CapacitorVoipCallsPlugin.getInstance()?.activity ?: (context as? Activity)
    }

    private fun installWatchdog(context: Context) {
        if (watchdogInstalled) return
        watchdogInstalled = true
        val appContext = context.applicationContext
        val runnable = object : Runnable {
            override fun run() {
                enforceContainment(appContext, "watchdog")
                mainHandler.postDelayed(this, WATCHDOG_MS)
            }
        }
        mainHandler.postDelayed(runnable, WATCHDOG_MS)
    }

    private fun installPstnListener(context: Context) {
        if (pstnListenerInstalled) return
        pstnListenerInstalled = true
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_PHONE_STATE)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Log.w(TAG, "READ_PHONE_STATE not granted — PSTN listener skipped")
            return
        }
        val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    if (state == TelephonyManager.CALL_STATE_RINGING ||
                        state == TelephonyManager.CALL_STATE_OFFHOOK
                    ) {
                        enforceContainment(context, "pstn_state_$state")
                    }
                }
            }
            tm.registerTelephonyCallback(context.mainExecutor, callback)
            return
        }
        @Suppress("DEPRECATION")
        tm.listen(
            object : PhoneStateListener() {
                @Deprecated("Deprecated in Java")
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    if (state == TelephonyManager.CALL_STATE_RINGING ||
                        state == TelephonyManager.CALL_STATE_OFFHOOK
                    ) {
                        enforceContainment(context, "pstn_state_$state")
                    }
                }
            },
            PhoneStateListener.LISTEN_CALL_STATE,
        )
    }
}
`

if (
  !fs.existsSync(appSystemEffectsGuardPath) ||
  !fs.readFileSync(appSystemEffectsGuardPath, 'utf8').includes(systemEffectsContainmentMarker)
) {
  fs.writeFileSync(appSystemEffectsGuardPath, appSystemEffectsGuardSource)
  changed = true
  console.log('[patch-android-fcm] AppSystemEffectsGuard.kt (PSTN containment)')
}

if (fs.existsSync(androidAudioCleanupPath)) {
  let cleanup = fs.readFileSync(androidAudioCleanupPath, 'utf8')
  if (!cleanup.includes('fun releaseGlobalAudioRouting')) {
    cleanup = cleanup.replace(
      `/** Reset global audio routing AiMediaTank may have touched. Does not change volume levels. */
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
        // ${pstnSafeAudioCleanupMarker}
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                am.clearCommunicationDevice()
            } catch (e: Exception) {
                Log.w(TAG, "clearCommunicationDevice skipped", e)
            }
        }
        if (am.mode != AudioManager.MODE_NORMAL) {
            am.mode = AudioManager.MODE_NORMAL
        }
        @Suppress("DEPRECATION")
        am.abandonAudioFocus(null)
    }
}`,
      `/** Reset global audio routing AiMediaTank may have touched. Does not change volume levels. */
object AndroidAudioCleanup {
    private const val TAG = "AndroidAudioCleanup"

    @JvmStatic
    fun resetIfIdle(context: Context) {
        AppSystemEffectsGuard.enforceContainment(context, "reset_if_idle")
    }

    @JvmStatic
    fun releaseGlobalAudioRouting(context: Context) {
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                am.clearCommunicationDevice()
            } catch (e: Exception) {
                Log.w(TAG, "clearCommunicationDevice skipped", e)
            }
        }
        if (am.mode != AudioManager.MODE_NORMAL) {
            am.mode = AudioManager.MODE_NORMAL
        }
        @Suppress("DEPRECATION")
        am.abandonAudioFocus(null)
    }
}`,
    )
    if (!cleanup.includes('fun releaseGlobalAudioRouting')) {
      cleanup = cleanup.replace(
        `@JvmStatic
    fun resetIfIdle(context: Context) {
        CapacitorVoipCallsPlugin.getInstance()?.callManager?.releaseIfStale()
        if (CallVolumeState.shouldAdjustMediaVolume()) return`,
        `@JvmStatic
    fun resetIfIdle(context: Context) {
        AppSystemEffectsGuard.enforceContainment(context, "reset_if_idle")
    }

    @JvmStatic
    fun releaseGlobalAudioRouting(context: Context) {
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
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                am.clearCommunicationDevice()
            } catch (e: Exception) {
                Log.w(TAG, "clearCommunicationDevice skipped", e)
            }
        }
        if (am.mode != AudioManager.MODE_NORMAL) {
            am.mode = AudioManager.MODE_NORMAL
        }
        @Suppress("DEPRECATION")
        am.abandonAudioFocus(null)
    }

    @JvmStatic
    private fun resetIfIdleLegacy(context: Context) {
        CapacitorVoipCallsPlugin.getInstance()?.callManager?.releaseIfStale()
        if (CallVolumeState.shouldAdjustMediaVolume()) return`,
      )
    }
    fs.writeFileSync(androidAudioCleanupPath, cleanup)
    changed = true
    console.log('[patch-android-fcm] AndroidAudioCleanup delegates to AppSystemEffectsGuard')
  }
}

const callManagerContainmentMarker = 'hasActiveAppCallSession'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (!callManager.includes(callManagerContainmentMarker)) {
    callManager = callManager.replace(
      `    fun reapplyVolumeControlStream() {
        if (!voiceCallAudioActive && !CallVolumeState.ringActive) return
        val stream = if (voiceCallAudioActive) {
            AudioManager.STREAM_VOICE_CALL
        } else {
            AudioManager.STREAM_MUSIC
        }`,
      `    fun hasActiveAppCallSession(): Boolean {
        // ${callManagerContainmentMarker}
        if (IncomingRingAudioHelper.isActive()) return true
        if (IncomingAnnouncementHelper.isActive()) return true
        if (activeCalls.isNotEmpty()) return true
        return try {
            NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl()) { _, _ -> }.isActive()
        } catch (_: Exception) {
            false
        }
    }

    fun forceReleaseGlobalAudio() {
        voiceCallAudioActive = false
        CallVolumeState.voiceCallActive = false
        releaseGlobalAudioSideEffects()
    }

    fun reapplyVolumeControlStream() {
        if (!voiceCallAudioActive && !CallVolumeState.ringActive) return
        val stream = if (voiceCallAudioActive) {
            AudioManager.STREAM_MUSIC
        } else if (CallVolumeState.ringActive) {
            AudioManager.STREAM_RING
        } else {
            AudioManager.STREAM_MUSIC
        }`,
    )
    callManager = callManager.replace(
      `        releaseGlobalAudioSideEffects()
    }

    fun setVoiceCallMediaVolume(level: Float) {`,
      `        releaseGlobalAudioSideEffects()
        AppSystemEffectsGuard.enforceContainment(context, "voice_audio_deactivated")
    }

    fun setVoiceCallMediaVolume(level: Float) {`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager app-call session tracking + PSTN-safe volume stream')
  }
}

const pluginContainmentMarker = 'AppSystemEffectsGuard.install'
if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (!pluginSource.includes(pluginContainmentMarker)) {
    pluginSource = pluginSource.replace(
      `    override fun load() {
        callManager = CallManager(this)
        pluginInstance = this
        flushPendingEvents()
    }`,
      `    override fun load() {
        callManager = CallManager(this)
        pluginInstance = this
        flushPendingEvents()
        // ${pluginContainmentMarker}
        AppSystemEffectsGuard.install(context.applicationContext)
    }`,
    )
    pluginSource = pluginSource.replace(
      `    override fun handleOnResume() {
        super.handleOnResume()
        // AiMediaTank reapply voice volume on resume
        callManager?.reapplyVolumeControlStream()
        IncomingRingAudioHelper.reapply(context)
    }`,
      `    override fun handleOnPause() {
        super.handleOnPause()
        AppSystemEffectsGuard.enforceContainment(context, "plugin_pause")
    }

    override fun handleOnResume() {
        super.handleOnResume()
        // AiMediaTank reapply voice volume on resume
        callManager?.reapplyVolumeControlStream()
        IncomingRingAudioHelper.reapply(context)
        AppSystemEffectsGuard.enforceContainment(context, "plugin_resume")
    }`,
    )
    pluginSource = pluginSource.replace(
      `    override fun handleOnDestroy() {
        if (pluginInstance === this) {
            pluginInstance = null
        }
        super.handleOnDestroy()
    }`,
      `    override fun handleOnDestroy() {
        AppSystemEffectsGuard.enforceContainment(context, "plugin_destroy")
        if (pluginInstance === this) {
            pluginInstance = null
        }
        super.handleOnDestroy()
    }`,
    )
    if (!pluginSource.includes('fun enforceSystemEffectsContainment')) {
      pluginSource = pluginSource.replace(
        `    @PluginMethod
    fun clearCallScreenPresentation(call: PluginCall) {
        // clearCallScreenPresentation uses force clear
        activity?.let { CallScreenPresentation.clear(it) }
        call.resolve()
    }`,
        `    @PluginMethod
    fun clearCallScreenPresentation(call: PluginCall) {
        // clearCallScreenPresentation uses force clear
        activity?.let { CallScreenPresentation.clear(it) }
        call.resolve()
    }

    @PluginMethod
    fun enforceSystemEffectsContainment(call: PluginCall) {
        AppSystemEffectsGuard.enforceContainment(context, "js_request")
        call.resolve()
    }`,
      )
    }
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] plugin lifecycle + enforceSystemEffectsContainment')
  }
}

const removeGlobalLoudnessMarker = 'no global LoudnessEnhancer session 0'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (callManager.includes('LoudnessEnhancer(0)') && !callManager.includes(removeGlobalLoudnessMarker)) {
    callManager = callManager.replace(
      `    private fun enableVoiceCallLoudnessBoost() {
        // AiMediaTank voice call loudness enhancer
        releaseVoiceCallLoudnessBoost()
        try {
            voiceCallLoudnessEnhancer = LoudnessEnhancer(0).apply {
                setTargetGain(voiceCallLoudnessBoostMb)
                enabled = true
            }
        } catch (e: Exception) {
            android.util.Log.w("CallManager", "voice call loudness boost unavailable", e)
        }
    }`,
      `    private fun enableVoiceCallLoudnessBoost() {
        // ${voiceCallLoudnessBoostMarker} — ${removeGlobalLoudnessMarker}
        releaseVoiceCallLoudnessBoost()
    }`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager disable global LoudnessEnhancer(0)')
  }
}

const yieldToPstnMarker = 'yieldToPstn unconditional'
const pstnSafeModeMarker = 'PSTN-safe never MODE_IN_COMMUNICATION'

if (fs.existsSync(appSystemEffectsGuardPath)) {
  let guard = fs.readFileSync(appSystemEffectsGuardPath, 'utf8')
  if (!guard.includes(yieldToPstnMarker)) {
    guard = guard.replace(
      `        return try {
            val baseUrl = CapacitorVoipCallsPlugin.getInstance()?.callManager?.resolveWebRtcBaseUrl()
                ?: "https://aimediatank.com"
            NativeVoiceWebRtcEngine.shared(context.applicationContext, baseUrl) { _, _ -> }.isActive()
        } catch (_: Exception) {
            false
        }
    }`,
      `        return NativeVoiceWebRtcEngine.peekIsActive()
    }

    @JvmStatic
    fun yieldToPstn(context: Context, telephonyState: Int) {
        // ${yieldToPstnMarker}
        val appContext = context.applicationContext
        Log.i(TAG, "yield audio to PSTN state=$telephonyState")
        try {
            CapacitorVoipCallsPlugin.getInstance()?.callManager?.releaseIfStale()
        } catch (_: Exception) {
        }
        CallVolumeState.voiceCallActive = false
        CallVolumeState.ringActive = false
        try {
            CapacitorVoipCallsPlugin.getInstance()?.callManager?.forceReleaseGlobalAudio()
        } catch (_: Exception) {
            AndroidAudioCleanup.releaseGlobalAudioRouting(appContext)
        }
        resolveActivity(appContext)?.let { activity ->
            CallScreenPresentation.clear(activity)
        }
        if (!NativeVoiceWebRtcEngine.peekIsMediaConnected()) {
            NativeVoiceWebRtcEngine.endGlobal()
        }
    }`,
    )
    guard = guard.replace(
      `                        enforceContainment(context, "pstn_state_$state")`,
      `                        yieldToPstn(context, state)`,
    )
    guard = guard.replace(
      `    private const val WATCHDOG_MS = 45_000L`,
      `    private const val WATCHDOG_MS = 15_000L`,
    )
    fs.writeFileSync(appSystemEffectsGuardPath, guard)
    changed = true
    console.log('[patch-android-fcm] AppSystemEffectsGuard yieldToPstn on cellular ring/answer')
  } else if (guard.includes('enforceContainment(context, "pstn_state_$state")')) {
    guard = guard.replace(
      `enforceContainment(context, "pstn_state_$state")`,
      `yieldToPstn(context, state)`,
    )
    fs.writeFileSync(appSystemEffectsGuardPath, guard)
    changed = true
    console.log('[patch-android-fcm] AppSystemEffectsGuard legacy PSTN listener yieldToPstn')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (callManager.includes('NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl())') &&
      callManager.includes('hasActiveAppCallSession') &&
      !callManager.includes('NativeVoiceWebRtcEngine.peekIsActive()')) {
    callManager = callManager.replace(
      `        return try {
            NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl()) { _, _ -> }.isActive()
        } catch (_: Exception) {
            false
        }`,
      `        return NativeVoiceWebRtcEngine.peekIsActive()`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager peek WebRTC without creating engine')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (callManager.includes('fun applyTelecomSpeakerRoute()') && !callManager.includes(pstnSafeModeMarker)) {
    callManager = callManager.replace(
      `    fun applyTelecomSpeakerRoute() {
        // AiMediaTank telecom managed speaker route
        var telecomRouted = false
        for (connection in activeCalls.values) {
            connection.requestSpeakerRoute()
            telecomRouted = true
        }
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
        if (!telecomRouted) {
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    val speaker = audioManager.availableCommunicationDevices
                        .firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
                    if (speaker != null) {
                        audioManager.setCommunicationDevice(speaker)
                    }
                } catch (_: Exception) {
                }
            }
        }
        setVoiceCallMediaVolume(1.0f)
        android.util.Log.i(
            "CallManager",
            "telecom speaker route connections=\${activeCalls.size} telecom=\$telecomRouted",
        )
    }`,
      `    fun applyTelecomSpeakerRoute() {
        // AiMediaTank telecom managed speaker route
        // ${pstnSafeModeMarker}
        var telecomRouted = false
        for (connection in activeCalls.values) {
            connection.requestSpeakerRoute()
            telecomRouted = true
        }
        val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        @Suppress("DEPRECATION")
        audioManager.isSpeakerphoneOn = true
        if (telecomRouted && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val speaker = audioManager.availableCommunicationDevices
                    .firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
                if (speaker != null) {
                    audioManager.setCommunicationDevice(speaker)
                }
            } catch (_: Exception) {
            }
        }
        if (audioManager.mode != AudioManager.MODE_NORMAL) {
            audioManager.mode = AudioManager.MODE_NORMAL
        }
        setVoiceCallMediaVolume(1.0f)
        android.util.Log.i(
            "CallManager",
            "telecom speaker route connections=\${activeCalls.size} telecom=\$telecomRouted",
        )
    }`,
    )
    callManager = callManager.replace(
      `            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
            reapplyVolumeControlStream()`,
      `            val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            // ${pstnSafeModeMarker}
            @Suppress("DEPRECATION")
            audioManager.isSpeakerphoneOn = true
            if (audioManager.mode != AudioManager.MODE_NORMAL) {
                audioManager.mode = AudioManager.MODE_NORMAL
            }
            reapplyVolumeControlStream()`,
    )
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager PSTN-safe audio mode (MODE_NORMAL)')
  }
}

if (fs.existsSync(nativeWebRtcEngineDestPath)) {
  let engine = fs.readFileSync(nativeWebRtcEngineDestPath, 'utf8')
  if (!engine.includes('fun peekIsActive()')) {
    engine = engine.replace(
      `        fun isHandlingCallId(callIdRaw: String): Boolean {
            val engine = instance ?: return false
            return engine.isHandlingCall(callIdRaw)
        }
    }`,
      `        fun isHandlingCallId(callIdRaw: String): Boolean {
            val engine = instance ?: return false
            return engine.isHandlingCall(callIdRaw)
        }

        fun peekIsActive(): Boolean = instance?.isActive() == true

        fun peekIsMediaConnected(): Boolean = instance?.isMediaConnected == true
    }`,
    )
    fs.writeFileSync(nativeWebRtcEngineDestPath, engine)
    changed = true
    console.log('[patch-android-fcm] NativeVoiceWebRtcEngine peek helpers')
  }
}

const incomingAnnouncementHelperSourcePath = path.join(__dirname, 'android-native', 'IncomingAnnouncementHelper.kt')
const incomingAnnouncementHelperDestPath = path.join(pluginDir, 'IncomingAnnouncementHelper.kt')
const incomingAnnouncementMarker = 'IncomingAnnouncementHelper'
if (fs.existsSync(incomingAnnouncementHelperSourcePath)) {
  const announceSource = fs.readFileSync(incomingAnnouncementHelperSourcePath, 'utf8')
  if (
    !fs.existsSync(incomingAnnouncementHelperDestPath) ||
    fs.readFileSync(incomingAnnouncementHelperDestPath, 'utf8') !== announceSource
  ) {
    fs.writeFileSync(incomingAnnouncementHelperDestPath, announceSource)
    changed = true
    console.log('[patch-android-fcm] IncomingAnnouncementHelper.kt')
  }
}

if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  const announceMethodAsync = `    @PluginMethod
    fun startCallRingAnnouncement(call: PluginCall) {
        val text = call.getString("text")?.trim().orEmpty()
        if (text.isEmpty()) {
            call.reject("Missing text parameter")
            return
        }
        IncomingRingAudioHelper.stop(context)
        IncomingAnnouncementHelper.start(context, text, call.getString("lang")) { ok ->
            if (ok) call.resolve() else call.reject("TextToSpeech unavailable")
        }
    }`
  if (!pluginSource.includes('fun startCallRingAnnouncement')) {
    const stopRingBlock = `    @PluginMethod
    fun stopCallRing(call: PluginCall) {
        IncomingRingAudioHelper.stop(context)
        call.resolve()
    }`
    const stopRingWithAnnounce = `    @PluginMethod
    fun stopCallRing(call: PluginCall) {
        IncomingAnnouncementHelper.stop(context)
        IncomingRingAudioHelper.stop(context)
        call.resolve()
    }

${announceMethodAsync}`
    if (pluginSource.includes(stopRingBlock)) {
      pluginSource = pluginSource.replace(stopRingBlock, stopRingWithAnnounce)
    } else if (pluginSource.includes('IncomingRingAudioHelper.stop(context)\n        call.resolve()')) {
      pluginSource = pluginSource.replace(
        `    fun stopCallRing(call: PluginCall) {
        IncomingRingAudioHelper.stop(context)
        call.resolve()
    }`,
        `    fun stopCallRing(call: PluginCall) {
        IncomingAnnouncementHelper.stop(context)
        IncomingRingAudioHelper.stop(context)
        call.resolve()
    }

${announceMethodAsync}`,
      )
    }
    if (pluginSource.includes('fun startCallRingAnnouncement')) {
      fs.writeFileSync(pluginPath, pluginSource)
      changed = true
      console.log('[patch-android-fcm] startCallRingAnnouncement plugin method')
    }
  } else if (
    pluginSource.includes('IncomingAnnouncementHelper.start(context, text, call.getString("lang"))') &&
    !pluginSource.includes('TextToSpeech unavailable')
  ) {
    pluginSource = pluginSource.replace(
      /    @PluginMethod\n    fun startCallRingAnnouncement\(call: PluginCall\) \{[\s\S]*?\n    \}/,
      announceMethodAsync,
    )
    if (pluginSource.includes('TextToSpeech unavailable')) {
      fs.writeFileSync(pluginPath, pluginSource)
      changed = true
      console.log('[patch-android-fcm] startCallRingAnnouncement awaits TTS ready')
    }
  }
}

const appSystemEffectsGuardSourcePath = path.join(__dirname, 'android-native', 'AppSystemEffectsGuard.kt')
if (fs.existsSync(appSystemEffectsGuardSourcePath)) {
  const guardSource = fs.readFileSync(appSystemEffectsGuardSourcePath, 'utf8')
  if (
    !fs.existsSync(appSystemEffectsGuardPath) ||
    fs.readFileSync(appSystemEffectsGuardPath, 'utf8') !== guardSource
  ) {
    fs.writeFileSync(appSystemEffectsGuardPath, guardSource)
    changed = true
    console.log('[patch-android-fcm] AppSystemEffectsGuard.kt (incoming-safe containment v3)')
  }
}

if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  let callManagerChanged = false
  if (
    callManager.includes('fun hasActiveAppCallSession()') &&
    callManager.includes('IncomingRingAudioHelper.isActive()') &&
    !callManager.includes('IncomingAnnouncementHelper.isActive()')
  ) {
    callManager = callManager.replace(
      `    fun hasActiveAppCallSession(): Boolean {
        // hasActiveAppCallSession
        if (IncomingRingAudioHelper.isActive()) return true
        if (activeCalls.isNotEmpty()) return true`,
      `    fun hasActiveAppCallSession(): Boolean {
        // hasActiveAppCallSession
        if (IncomingRingAudioHelper.isActive()) return true
        if (IncomingAnnouncementHelper.isActive()) return true
        if (activeCalls.isNotEmpty()) return true`,
    )
    callManagerChanged = callManager.includes('IncomingAnnouncementHelper.isActive()')
  }
  if (
    callManager.includes('never purge ringing telecom') &&
    callManager.includes('if (IncomingRingAudioHelper.isActive()) return') &&
    !callManager.match(
      /fun releaseIfStale\(\) \{[\s\S]*?IncomingAnnouncementHelper\.isActive\(\)[\s\S]*?fun releaseGlobalAudioSideEffects/,
    )
  ) {
    callManager = callManager.replace(
      `    fun releaseIfStale() {
        // never purge ringing telecom — ConnectionService rings before WebRTC starts
        if (IncomingRingAudioHelper.isActive()) return
        if (activeCalls.isNotEmpty()) return`,
      `    fun releaseIfStale() {
        // never purge ringing telecom — ConnectionService rings before WebRTC starts
        if (IncomingRingAudioHelper.isActive()) return
        if (IncomingAnnouncementHelper.isActive()) return
        if (activeCalls.isNotEmpty()) return`,
    )
    callManagerChanged = true
  }
  if (callManager.includes(purgeOrphanTelecomMarker) && !callManager.includes('never purge ringing telecom')) {
    callManager = callManager.replace(
      /    fun releaseIfStale\(\) \{[\s\S]*?\n    \}\n\n    fun releaseGlobalAudioSideEffects/,
      `    fun releaseIfStale() {
        // never purge ringing telecom — ConnectionService rings before WebRTC starts
        if (IncomingRingAudioHelper.isActive()) return
        if (IncomingAnnouncementHelper.isActive()) return
        if (activeCalls.isNotEmpty()) return
        if (voiceCallAudioActive) {
            setVoiceCallAudioActive(false)
        }
    }

    fun releaseGlobalAudioSideEffects`,
    )
    callManagerChanged = true
    console.log('[patch-android-fcm] CallManager never purge ringing telecom')
  }
  if (callManagerChanged) {
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] CallManager announcement session checks')
  }
}

// Pass hasVideo into native WebRTC startCaller / prepareAnswer (idempotent upgrade).
const nativeWebRtcHasVideoMarker = 'startCaller(callId, iceServersJson, wantsVideo)'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  let cmChanged = false
  if (
    callManager.includes('fun startNativeWebRtcCaller(callId: String, iceServersJson: org.json.JSONArray?) {') &&
    !callManager.includes(nativeWebRtcHasVideoMarker)
  ) {
    callManager = callManager.replace(
      /fun startNativeWebRtcCaller\(callId: String, iceServersJson: org\.json\.JSONArray\?\) \{[\s\S]*?\.startCaller\(callId, iceServersJson\)\n    \}/,
      `fun startNativeWebRtcCaller(callId: String, iceServersJson: org.json.JSONArray?, wantsVideo: Boolean = false) {
        val emitter = eventEmitter ?: return
        NativeVoiceWebRtcEngine.shared(context, resolveWebRtcBaseUrl(), emitter).startCaller(callId, iceServersJson, wantsVideo)
    }`,
    )
    cmChanged = true
  }
  if (cmChanged) {
    fs.writeFileSync(callManagerPath, callManager)
    changed = true
    console.log('[patch-android-fcm] startNativeWebRtcCaller wantsVideo')
  }
}

if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  let pluginChanged = false
  // Targeted caller fix — do not require matching the full prepareAnswer body.
  if (
    pluginSource.includes('callManager?.startNativeWebRtcCaller(callId, iceJson)') &&
    !pluginSource.includes('startNativeWebRtcCaller(callId, iceJson, hasVideo)')
  ) {
    pluginSource = pluginSource.replace(
      `        val iceArray = call.getArray("iceServers")
        val iceJson = if (iceArray != null) org.json.JSONArray(iceArray.toString()) else null
        callManager?.startNativeWebRtcCaller(callId, iceJson)
        call.resolve()
    }`,
      `        val iceArray = call.getArray("iceServers")
        val iceJson = if (iceArray != null) org.json.JSONArray(iceArray.toString()) else null
        val hasVideo = call.getBoolean("hasVideo", false) ?: false
        callManager?.startNativeWebRtcCaller(callId, iceJson, hasVideo)
        call.resolve()
    }`,
    )
    pluginChanged = true
  }
  // Legacy answer path without remoteOfferSdp
  if (
    pluginSource.includes('NativeVoiceWebRtcEngine.shared(context, baseUrl, ::emitEvent).prepareAnswer(callId, token)') &&
    !pluginSource.includes('prepareAnswer(callId, token, wantsVideo = hasVideo)') &&
    !pluginSource.includes('prepareAnswer(callId, token, remoteOfferSdp, hasVideo)')
  ) {
    pluginSource = pluginSource.replace(
      `        val token = call.getString("declineToken")
        val baseUrl = bridge.serverUrl.toString().trimEnd('/')
        NativeVoiceWebRtcEngine.shared(context, baseUrl, ::emitEvent).prepareAnswer(callId, token)
        call.resolve()
    }`,
      `        val token = call.getString("declineToken")
        val baseUrl = bridge.serverUrl.toString().trimEnd('/')
        val hasVideo = call.getBoolean("hasVideo", false) ?: false
        NativeVoiceWebRtcEngine.shared(context, baseUrl, ::emitEvent).prepareAnswer(callId, token, wantsVideo = hasVideo)
        call.resolve()
    }`,
    )
    pluginChanged = true
  }
  // remoteOfferSdp variant of prepareAnswer
  if (
    pluginSource.includes('prepareAnswer(callId, token, remoteOfferSdp)') &&
    !pluginSource.includes('prepareAnswer(callId, token, remoteOfferSdp, hasVideo)')
  ) {
    pluginSource = pluginSource.replace(
      `        val remoteOfferSdp = call.getString("remoteOfferSdp")
        val baseUrl = callManager?.resolveWebRtcBaseUrl() ?: "https://aimediatank.com"
        NativeVoiceWebRtcEngine.shared(context, baseUrl, ::emitEvent).prepareAnswer(callId, token, remoteOfferSdp)`,
      `        val remoteOfferSdp = call.getString("remoteOfferSdp")
        val hasVideo = call.getBoolean("hasVideo", false) ?: false
        val baseUrl = callManager?.resolveWebRtcBaseUrl() ?: "https://aimediatank.com"
        NativeVoiceWebRtcEngine.shared(context, baseUrl, ::emitEvent).prepareAnswer(callId, token, remoteOfferSdp, hasVideo)`,
    )
    pluginChanged = true
  }
  if (pluginChanged) {
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] plugin hasVideo for native WebRTC')
  }
}

// Collapse duplicate loudness helpers (re-patch after cap sync used to re-insert them).
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  const enableMatches = callManager.match(/private fun enableVoiceCallLoudnessBoost\(\)/g) || []
  const releaseMatches = callManager.match(/private fun releaseVoiceCallLoudnessBoost\(\)/g) || []
  if (enableMatches.length > 1 || releaseMatches.length > 1) {
    // Keep a single no-op enable + release pair; drop every prior copy.
    const enableBlock =
      /    private fun enableVoiceCallLoudnessBoost\(\) \{[\s\S]*?\n    \}\n\n/g
    const releaseBlock =
      /    private fun releaseVoiceCallLoudnessBoost\(\) \{[\s\S]*?\n    \}\n\n/g
    callManager = callManager.replace(enableBlock, '')
    callManager = callManager.replace(releaseBlock, '')
    const insertBefore = '    fun reapplyVolumeControlStream() {'
    if (callManager.includes(insertBefore) && !callManager.includes('private fun enableVoiceCallLoudnessBoost()')) {
      callManager = callManager.replace(
        insertBefore,
        `    private fun enableVoiceCallLoudnessBoost() {
        // ${voiceCallLoudnessBoostMarker} — ${removeGlobalLoudnessMarker}
        releaseVoiceCallLoudnessBoost()
    }

    private fun releaseVoiceCallLoudnessBoost() {
        voiceCallLoudnessEnhancer?.let { enhancer ->
            try {
                enhancer.enabled = false
                enhancer.release()
            } catch (_: Exception) {
            }
        }
        voiceCallLoudnessEnhancer = null
    }

${insertBefore}`,
      )
      fs.writeFileSync(callManagerPath, callManager)
      changed = true
      console.log('[patch-android-fcm] CallManager dedupe loudness boost helpers')
    }
  }
}

// ---------------------------------------------------------------------------
// Early caller hangup vs late ring FCM (Android Accept UI flash)
// Cancel must be remembered even when ConnectionService has not reported yet;
// reportIncomingCall / IncomingCallUiHelper must honor that mark.
// ---------------------------------------------------------------------------

const cancelRememberMarker = 'AiMediaTank remember cancelled call id'
if (fs.existsSync(pluginPath)) {
  let pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (pluginSource.includes('AiMediaTank FCM cancel push') && !pluginSource.includes(cancelRememberMarker)) {
    const cancelWithoutRemember =
      `            if (data["action"]?.lowercase() == "cancel") {
                val cancelCallId = data["callId"] ?: return
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val manager = CallManager(context)
                    manager.endCall(cancelCallId)
                    manager.rejectCall(cancelCallId)
                }`
    const cancelWithRemember =
      `            if (data["action"]?.lowercase() == "cancel") {
                val cancelCallId = data["callId"] ?: return
                // ${cancelRememberMarker}
                val prefs = context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                prefs.edit().putLong("cancelled_" + cancelCallId.lowercase(), System.currentTimeMillis()).apply()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val manager = CapacitorVoipCallsPlugin.getInstance()?.callManager ?: CallManager(context)
                    manager.endCall(cancelCallId)
                    manager.rejectCall(cancelCallId)
                }`
    if (pluginSource.includes(cancelWithoutRemember)) {
      pluginSource = pluginSource.replace(cancelWithoutRemember, cancelWithRemember)
      fs.writeFileSync(pluginPath, pluginSource)
      changed = true
      console.log('[patch-android-fcm] FCM cancel remembers cancelled call id (gate)')
    } else if (
      pluginSource.includes('if (data["action"]?.lowercase() == "cancel")') &&
      !pluginSource.includes('cancelled_" + cancelCallId.lowercase()')
    ) {
      pluginSource = pluginSource.replace(
        `            if (data["action"]?.lowercase() == "cancel") {
                val cancelCallId = data["callId"] ?: return
`,
        `            if (data["action"]?.lowercase() == "cancel") {
                val cancelCallId = data["callId"] ?: return
                // ${cancelRememberMarker}
                val prefs = context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                prefs.edit().putLong("cancelled_" + cancelCallId.lowercase(), System.currentTimeMillis()).apply()
`,
      )
      fs.writeFileSync(pluginPath, pluginSource)
      changed = true
      console.log('[patch-android-fcm] FCM cancel remembers cancelled call id (insert)')
    }
  }

  // Prefer plugin CallManager singleton so cancel ends the same instance that reported the ring.
  if (
    pluginSource.includes('cancelled_" + cancelCallId.lowercase()') &&
    pluginSource.includes('val manager = CallManager(context)') &&
    pluginSource.includes('manager.endCall(cancelCallId)') &&
    !pluginSource.includes('getInstance()?.callManager ?: CallManager(context)')
  ) {
    pluginSource = fs.readFileSync(pluginPath, 'utf8')
    const cancelBareManager =
      `                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val manager = CallManager(context)
                    manager.endCall(cancelCallId)
                    manager.rejectCall(cancelCallId)
                }`
    const cancelSingletonManager =
      `                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val manager = CapacitorVoipCallsPlugin.getInstance()?.callManager ?: CallManager(context)
                    manager.endCall(cancelCallId)
                    manager.rejectCall(cancelCallId)
                }`
    if (pluginSource.includes(cancelBareManager)) {
      pluginSource = pluginSource.replace(cancelBareManager, cancelSingletonManager)
      fs.writeFileSync(pluginPath, pluginSource)
      changed = true
      console.log('[patch-android-fcm] FCM cancel uses plugin CallManager singleton')
    }
  }

  pluginSource = fs.readFileSync(pluginPath, 'utf8')
  if (
    pluginSource.includes('AiMediaTank skip cancelled incoming') &&
    pluginSource.includes(
      `                try {
                    val manager = CallManager(context)
                    manager.reportIncomingCall(`,
    ) &&
    !pluginSource.includes(
      `                try {
                    val manager = CapacitorVoipCallsPlugin.getInstance()?.callManager ?: CallManager(context)
                    manager.reportIncomingCall(`,
    )
  ) {
    pluginSource = pluginSource.replace(
      `                try {
                    val manager = CallManager(context)
                    manager.reportIncomingCall(`,
      `                try {
                    val manager = CapacitorVoipCallsPlugin.getInstance()?.callManager ?: CallManager(context)
                    manager.reportIncomingCall(`,
    )
    fs.writeFileSync(pluginPath, pluginSource)
    changed = true
    console.log('[patch-android-fcm] FCM incoming uses plugin CallManager singleton')
  }
}

const callManagerCancelGateMarker = 'AiMediaTank CallManager cancel gate'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (callManager.includes('fun reportIncomingCall(') && !callManager.includes(callManagerCancelGateMarker)) {
    const gateInsertTargets = [
      `    ) {
        val normalized = callId.lowercase()
        if (NativeVoiceWebRtcEngine.isHandlingCallId(callId)) {`,
      `    ) {
        val normalized = callId.lowercase()
        if (reportedIncomingCallIds.contains(normalized)) {`,
      `    ) {
        val phoneAccount = VoipConnectionService.getPhoneAccount(context)`,
    ]
    const gateBlock = `    ) {
        val normalized = callId.lowercase()
        // ${callManagerCancelGateMarker}
        val cancelledAt = context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
            .getLong("cancelled_" + normalized, 0L)
        if (cancelledAt > 0L && System.currentTimeMillis() - cancelledAt < 120_000L) {
            android.util.Log.i("CallManager", "skip incoming — already cancelled $callId")
            reportedIncomingCallIds.add(normalized)
            try {
                IncomingCallUiHelper.dismiss(context)
            } catch (_: Exception) {
            }
            eventEmitter?.invoke("callEnded", JSObject().apply { put("callId", callId) })
            return
        }
`
    let applied = false
    for (const target of gateInsertTargets) {
      if (callManager.includes(target)) {
        if (target.includes('NativeVoiceWebRtcEngine.isHandlingCallId')) {
          callManager = callManager.replace(
            target,
            `${gateBlock}        if (NativeVoiceWebRtcEngine.isHandlingCallId(callId)) {`,
          )
        } else if (target.includes('reportedIncomingCallIds.contains')) {
          callManager = callManager.replace(
            target,
            `${gateBlock}        if (reportedIncomingCallIds.contains(normalized)) {`,
          )
        } else {
          callManager = callManager.replace(
            target,
            `${gateBlock}        val phoneAccount = VoipConnectionService.getPhoneAccount(context)`,
          )
        }
        applied = true
        break
      }
    }
    if (applied) {
      fs.writeFileSync(callManagerPath, callManager)
      changed = true
      console.log('[patch-android-fcm] CallManager skips cancelled incoming calls')
    }
  }
}

const uiHelperCancelGateMarker = 'AiMediaTank skip cancelled present'
if (fs.existsSync(incomingCallUiPath)) {
  let helper = fs.readFileSync(incomingCallUiPath, 'utf8')
  if (helper.includes('fun present(') && !helper.includes(uiHelperCancelGateMarker)) {
    const presentOld =
      `    fun present(context: Context, callId: String, displayName: String) {
        ensureNotificationChannel(context)`
    const presentNew =
      `    fun present(context: Context, callId: String, displayName: String) {
        // ${uiHelperCancelGateMarker}
        val cancelledAt = context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
            .getLong("cancelled_" + callId.lowercase(), 0L)
        if (cancelledAt > 0L && System.currentTimeMillis() - cancelledAt < 120_000L) {
            Log.i(TAG, "skip present — already cancelled $callId")
            dismiss(context)
            return
        }
        ensureNotificationChannel(context)`
    if (helper.includes(presentOld)) {
      helper = helper.replace(presentOld, presentNew)
      fs.writeFileSync(incomingCallUiPath, helper)
      changed = true
      console.log('[patch-android-fcm] IncomingCallUiHelper skips cancelled present')
    }
  }
}

// Lock-screen video Accept: skip native audio-only PC and tell JS hasVideo so WebView
// VoiceCallOverlay paints (native CallVideo Dialog is disabled on Samsung).
const lockScreenVideoWebRtcMarker = 'AiMediaTank lock-screen video uses WebView WebRTC'
if (fs.existsSync(callManagerPath)) {
  let callManager = fs.readFileSync(callManagerPath, 'utf8')
  if (
    callManager.includes('fun notifyCallAnswered(callId: String)') &&
    !callManager.includes(lockScreenVideoWebRtcMarker)
  ) {
    // Persist FCM/Telecom video flag when the incoming call is reported.
    if (
      callManager.includes('reportedIncomingCallIds.add(normalized)') &&
      !callManager.includes('incoming_video_')
    ) {
      callManager = callManager.replace(
        `        reportedIncomingCallIds.add(normalized)
        val phoneAccount = VoipConnectionService.getPhoneAccount(context)`,
        `        reportedIncomingCallIds.add(normalized)
        context.getSharedPreferences("amt_voice", android.content.Context.MODE_PRIVATE)
            .edit()
            .putBoolean("incoming_video_" + normalized, video)
            .apply()
        val phoneAccount = VoipConnectionService.getPhoneAccount(context)`,
      )
    }

    // Current notifyCallAnswered always starts native prepareAnswer — skip for video.
    const notifyOld = `    fun notifyCallAnswered(callId: String) {
        val normalized = callId.lowercase()
        // AiMediaTank always start native WebRTC on Accept
        var token = declineTokensByCallId[normalized]
        if (token.isNullOrBlank()) {
            token = context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                .getString("decline_" + normalized, null)
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
            if (token != null) declineTokensByCallId[normalized] = token
        }
        val data = JSObject().apply {
            put("callId", callId)
            put("nativeWebRtc", true)
            if (token != null) put("declineToken", token)
        }
        eventEmitter?.invoke("callAnswered", data)
        // Always start prepareAnswer — do not require eventEmitter (cold lock-screen Accept).
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            startNativeWebRtcAnswer(callId, token)
        }
    }`

    const notifyNew = `    fun notifyCallAnswered(callId: String) {
        val normalized = callId.lowercase()
        // AiMediaTank always start native WebRTC on Accept
        var token = declineTokensByCallId[normalized]
        if (token.isNullOrBlank()) {
            token = context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                .getString("decline_" + normalized, null)
                ?.trim()
                ?.takeIf { it.isNotEmpty() }
            if (token != null) declineTokensByCallId[normalized] = token
        }
        val prefs = context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
        val incomingVideo = prefs.getBoolean("incoming_video_" + normalized, false)
        val webOwnsVideo = prefs.getBoolean("web_video_" + normalized, false)
        val isVideo = incomingVideo || webOwnsVideo
        // ${lockScreenVideoWebRtcMarker}
        if (isVideo) {
            prefs.edit().putBoolean("web_video_" + normalized, true).apply()
        }
        val data = JSObject().apply {
            put("callId", callId)
            put("nativeWebRtc", true)
            if (isVideo) put("hasVideo", true)
            if (token != null) put("declineToken", token)
        }
        eventEmitter?.invoke("callAnswered", data)
        if (isVideo) {
            try { IncomingCallUiHelper.dismiss(context) } catch (_: Exception) {}
            // WebView owns Android video — do not start native audio-only PeerConnection.
            return
        }
        // Always start prepareAnswer — do not require eventEmitter (cold lock-screen Accept).
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            startNativeWebRtcAnswer(callId, token)
        }
    }`

    if (callManager.includes(notifyOld)) {
      callManager = callManager.replace(notifyOld, notifyNew)
    } else if (
      callManager.includes('Always start prepareAnswer') &&
      callManager.includes('startNativeWebRtcAnswer(callId, token)')
    ) {
      // Fallback: inject video gate before the main-looper post.
      callManager = callManager.replace(
        `        eventEmitter?.invoke("callAnswered", data)
        // Always start prepareAnswer — do not require eventEmitter (cold lock-screen Accept).
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            startNativeWebRtcAnswer(callId, token)
        }`,
        `        val prefs = context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
        val incomingVideo = prefs.getBoolean("incoming_video_" + normalized, false)
        val webOwnsVideo = prefs.getBoolean("web_video_" + normalized, false)
        val isVideo = incomingVideo || webOwnsVideo
        // ${lockScreenVideoWebRtcMarker}
        if (isVideo) {
            prefs.edit().putBoolean("web_video_" + normalized, true).apply()
            if (!data.has("hasVideo")) data.put("hasVideo", true)
        }
        eventEmitter?.invoke("callAnswered", data)
        if (isVideo) {
            try { IncomingCallUiHelper.dismiss(context) } catch (_: Exception) {}
            return
        }
        // Always start prepareAnswer — do not require eventEmitter (cold lock-screen Accept).
        android.os.Handler(android.os.Looper.getMainLooper()).post {
            startNativeWebRtcAnswer(callId, token)
        }`,
      )
      // Fix: data is built before prefs check in fallback — also patch data builder.
      if (
        callManager.includes(lockScreenVideoWebRtcMarker) &&
        callManager.includes('put("nativeWebRtc", true)') &&
        !callManager.includes('if (isVideo) put("hasVideo", true)')
      ) {
        // Prefer full replace path next run; for now ensure emit payload has hasVideo via prefs before build.
      }
    }

    const clearMarker = 'AiMediaTank clear incoming_video on end'
    if (
      callManager.includes(lockScreenVideoWebRtcMarker) &&
      callManager.includes('declineTokensByCallId.remove(callId.lowercase())') &&
      !callManager.includes(clearMarker)
    ) {
      callManager = callManager.replace(
        `        declineTokensByCallId.remove(callId.lowercase())`,
        `        declineTokensByCallId.remove(callId.lowercase())
        // ${clearMarker}
        context.getSharedPreferences("amt_voice", android.content.Context.MODE_PRIVATE)
            .edit()
            .remove("incoming_video_" + callId.lowercase())
            .apply()`,
      )
    }

    if (callManager.includes(lockScreenVideoWebRtcMarker)) {
      fs.writeFileSync(callManagerPath, callManager)
      changed = true
      console.log('[patch-android-fcm] lock-screen video Accept uses WebView WebRTC')
    } else {
      console.warn('[patch-android-fcm] lock-screen video patch: notifyCallAnswered shape not matched')
    }
  }
}

// Upgrade existing chat notification channel (heads-up + startup ensure).
if (fs.existsSync(chatMessageNotificationPath)) {
  let chatHelper = fs.readFileSync(chatMessageNotificationPath, 'utf8')
  let chatChanged = false

  if (chatHelper.includes('aimediatank_messages"') && !chatHelper.includes('aimediatank_messages_v2')) {
    chatHelper = chatHelper.replace(/aimediatank_messages/g, 'aimediatank_messages_v2')
    chatChanged = true
    console.log('[patch-android-fcm] chat channel id → aimediatank_messages_v2')
  }

  if (chatHelper.includes('IMPORTANCE_DEFAULT')) {
    chatHelper = chatHelper.replace(
      'NotificationManager.IMPORTANCE_DEFAULT',
      'NotificationManager.IMPORTANCE_HIGH',
    )
    chatChanged = true
    console.log('[patch-android-fcm] chat channel importance → HIGH')
  }

  if (chatHelper.includes('PRIORITY_DEFAULT')) {
    chatHelper = chatHelper.replace(
      'Notification.PRIORITY_DEFAULT',
      'Notification.PRIORITY_HIGH',
    )
    chatChanged = true
    console.log('[patch-android-fcm] chat notification priority → HIGH')
  }

  if (!chatHelper.includes('lockscreenVisibility')) {
    chatHelper = chatHelper.replace(
      'enableVibration(true)',
      `enableVibration(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC`,
    )
    chatChanged = true
    console.log('[patch-android-fcm] chat channel lockscreen visibility → PUBLIC')
  }

  if (!chatHelper.includes('ensureChannelAtStartup')) {
    chatHelper = chatHelper.replace(
      '    fun show(context: Context, title: String, body: String, url: String?, senderId: String?) {',
      `    /** Create channel at app launch so background FCM notifications are not dropped. */
    fun ensureChannelAtStartup(context: Context) {
        try {
            ensureChannel(context.applicationContext)
        } catch (e: Exception) {
            Log.e(TAG, "ensureChannelAtStartup failed", e)
        }
    }

    fun show(context: Context, title: String, body: String, url: String?, senderId: String?) {`,
    )
    chatChanged = true
    console.log('[patch-android-fcm] added ChatMessageNotificationHelper.ensureChannelAtStartup')
  }

  if (!chatHelper.includes('setVisibility(Notification.VISIBILITY_PUBLIC)')) {
    chatHelper = chatHelper.replace(
      '.setPriority(Notification.PRIORITY_HIGH)',
      `.setPriority(Notification.PRIORITY_HIGH)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder.setVisibility(Notification.VISIBILITY_PUBLIC)
            }`,
    )
    chatChanged = true
    console.log('[patch-android-fcm] chat notification visibility → PUBLIC')
  }

  if (chatChanged) {
    fs.writeFileSync(chatMessageNotificationPath, chatHelper)
    changed = true
  }
}
