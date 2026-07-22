package com.capacitor.voipcalls

import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import java.util.Locale

/**
 * Spoken ring announcement via Android TextToSpeech ("Call from Name" / "Calling Name").
 * Used instead of classic WAV on native Android so announcements work without WebView speechSynthesis.
 */
object IncomingAnnouncementHelper {
    private const val TAG = "IncomingAnnounce"
    private const val LOOP_GAP_MS = 900L
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile private var tts: TextToSpeech? = null
    @Volatile private var active = false
    @Volatile private var announcement = ""
    @Volatile private var langTag: String? = null
    private var loopRunnable: Runnable? = null

    fun isActive(): Boolean = active

    /**
     * @param onReady true once TTS is ready and first utterance queued; false on init failure.
     */
    fun start(
        context: Context,
        text: String,
        lang: String?,
        onReady: ((Boolean) -> Unit)? = null,
    ) {
        val spoken = text.trim()
        if (spoken.isEmpty()) {
            onReady?.invoke(false)
            return
        }
        stop(context)
        active = true
        CallVolumeState.ringActive = true
        announcement = spoken
        langTag = lang?.trim()?.takeIf { it.isNotEmpty() }

        val appContext = context.applicationContext
        tts = TextToSpeech(appContext) { status ->
            mainHandler.post {
                if (!active) {
                    onReady?.invoke(false)
                    return@post
                }
                if (status != TextToSpeech.SUCCESS) {
                    Log.w(TAG, "TextToSpeech init failed status=$status")
                    active = false
                    CallVolumeState.ringActive = false
                    onReady?.invoke(false)
                    return@post
                }
                val engine = tts
                if (engine == null) {
                    active = false
                    CallVolumeState.ringActive = false
                    onReady?.invoke(false)
                    return@post
                }
                applyAudioAttributes(engine)
                applyLanguage(engine)
                engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {}
                    override fun onDone(utteranceId: String?) {
                        if (!active) return
                        scheduleNext()
                    }
                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {
                        if (!active) return
                        scheduleNext()
                    }
                    override fun onError(utteranceId: String?, errorCode: Int) {
                        if (!active) return
                        scheduleNext()
                    }
                })
                speakNow()
                onReady?.invoke(true)
            }
        }
    }

    fun stop(context: Context) {
        active = false
        loopRunnable?.let { mainHandler.removeCallbacks(it) }
        loopRunnable = null
        try {
            tts?.stop()
        } catch (_: Exception) {
        }
        try {
            tts?.shutdown()
        } catch (_: Exception) {
        }
        tts = null
        announcement = ""
        if (!IncomingRingAudioHelper.isActive()) {
            CallVolumeState.ringActive = false
        }
    }

    private fun applyAudioAttributes(engine: TextToSpeech) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) return
        try {
            engine.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build(),
            )
        } catch (e: Exception) {
            Log.w(TAG, "setAudioAttributes failed", e)
        }
    }

    private fun applyLanguage(engine: TextToSpeech) {
        val tag = langTag
        val locale = when {
            tag.isNullOrBlank() -> Locale.getDefault()
            tag.contains('-') || tag.contains('_') -> Locale.forLanguageTag(tag.replace('_', '-'))
            else -> Locale(tag)
        }
        val result = engine.setLanguage(locale)
        if (result == TextToSpeech.LANG_MISSING_DATA || result == TextToSpeech.LANG_NOT_SUPPORTED) {
            Log.w(TAG, "TTS language unsupported $locale — falling back to default")
            engine.language = Locale.getDefault()
        }
    }

    private fun scheduleNext() {
        if (!active) return
        loopRunnable?.let { mainHandler.removeCallbacks(it) }
        val runnable = Runnable { speakNow() }
        loopRunnable = runnable
        mainHandler.postDelayed(runnable, LOOP_GAP_MS)
    }

    private fun speakNow() {
        if (!active) return
        val engine = tts ?: return
        val text = announcement
        if (text.isEmpty()) return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                val params = Bundle()
                engine.speak(text, TextToSpeech.QUEUE_FLUSH, params, "aimediatank-ring")
            } else {
                @Suppress("DEPRECATION")
                engine.speak(
                    text,
                    TextToSpeech.QUEUE_FLUSH,
                    hashMapOf(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID to "aimediatank-ring"),
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "speak failed", e)
            scheduleNext()
        }
    }
}
