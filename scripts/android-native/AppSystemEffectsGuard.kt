package com.capacitor.voipcalls

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
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
 *
 * Must not tear down ringing ConnectionService calls or strip voiceIncoming deep links.
 */
object AppSystemEffectsGuard {
    // AiMediaTank system effects containment
    // incoming-safe containment v2
    private const val TAG = "AppSystemEffectsGuard"
    private const val WATCHDOG_MS = 15_000L
    private val mainHandler = Handler(Looper.getMainLooper())
    @Volatile private var pstnListenerInstalled = false
    @Volatile private var watchdogInstalled = false

    @JvmStatic
    fun isAppCallSessionActive(context: Context): Boolean {
        if (IncomingRingAudioHelper.isActive()) return true
        if (hasVoiceIncomingIntent()) return true
        try {
            val manager = CapacitorVoipCallsPlugin.getInstance()?.callManager
            if (manager != null && manager.hasActiveAppCallSession()) return true
        } catch (_: Exception) {
        }
        return NativeVoiceWebRtcEngine.peekIsActive()
    }

    private fun hasVoiceIncomingIntent(): Boolean {
        val activity = CapacitorVoipCallsPlugin.getInstance()?.activity ?: return false
        val data: Uri = activity.intent?.data ?: return false
        return data.getQueryParameter("voiceIncoming") == "1"
    }

    @JvmStatic
    fun yieldToPstn(context: Context, telephonyState: Int) {
        // yieldToPstn unconditional
        val appContext = context.applicationContext
        // Self-managed VoIP can surface as RINGING/OFFHOOK on some OEMs — never tear down our own call.
        if (isAppCallSessionActive(appContext)) {
            Log.d(TAG, "skip yieldToPstn — app VoIP session active state=$telephonyState")
            return
        }
        Log.i(TAG, "yield audio to PSTN state=$telephonyState")
        CallVolumeState.voiceCallActive = false
        CallVolumeState.ringActive = false
        try {
            CapacitorVoipCallsPlugin.getInstance()?.callManager?.forceReleaseGlobalAudio()
        } catch (_: Exception) {
            AndroidAudioCleanup.releaseGlobalAudioRouting(appContext)
        }
        resolveActivity(appContext)?.let { activity ->
            CallScreenPresentation.clearWindowFlagsOnly(activity)
        }
        if (!NativeVoiceWebRtcEngine.peekIsMediaConnected()) {
            NativeVoiceWebRtcEngine.endGlobal()
        }
    }

    @JvmStatic
    fun enforceContainment(context: Context, reason: String) {
        val appContext = context.applicationContext
        // Check session BEFORE any stale release — releaseIfStale must not end ringing Telecom calls.
        if (isAppCallSessionActive(appContext)) {
            Log.d(TAG, "skip enforce ($reason) — app call session active")
            return
        }
        try {
            CapacitorVoipCallsPlugin.getInstance()?.callManager?.releaseIfStale()
        } catch (_: Exception) {
        }
        if (isAppCallSessionActive(appContext)) {
            Log.d(TAG, "skip enforce ($reason) — session became active")
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
        // Never strip voiceIncoming deep-link params here — that hides the incoming call UI.
        resolveActivity(appContext)?.let { activity ->
            CallScreenPresentation.clearWindowFlagsOnly(activity)
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
                        yieldToPstn(context, state)
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
                        yieldToPstn(context, state)
                    }
                }
            },
            PhoneStateListener.LISTEN_CALL_STATE,
        )
    }
}
