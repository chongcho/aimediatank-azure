package com.capacitor.voipcalls

import android.Manifest
import android.app.Activity
import android.app.Dialog
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.webkit.CookieManager
import android.graphics.drawable.ColorDrawable
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.getcapacitor.Bridge
import com.getcapacitor.JSObject
import org.json.JSONArray
import org.json.JSONObject
import org.webrtc.*
import org.webrtc.audio.JavaAudioDeviceModule
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Native WebRTC for Android voice calls (KakaoTalk-style MODE_IN_COMMUNICATION).
 * Signaling uses WebView session cookies or lock-screen decline tokens.
 */
class NativeVoiceWebRtcEngine private constructor(
    private val context: Context,
    private var baseUrl: String,
    private val eventEmitter: (String, JSObject) -> Unit,
) : PeerConnection.Observer {
    companion object {
        private const val TAG = "NativeVoiceWebRtc"

        @Volatile
        private var instance: NativeVoiceWebRtcEngine? = null

        fun shared(
            context: Context,
            baseUrl: String,
            eventEmitter: (String, JSObject) -> Unit,
        ): NativeVoiceWebRtcEngine {
            val normalizedBase = baseUrl.trimEnd('/')
            val existing = instance
            if (existing != null && existing.baseUrl == normalizedBase) {
                return existing
            }
            return synchronized(this) {
                val again = instance
                if (again != null && again.baseUrl == normalizedBase) {
                    again
                } else if (again != null && again.isActive()) {
                    Log.w(TAG, "keep active engine baseUrl=${again.baseUrl} requested=$normalizedBase")
                    again
                } else {
                    instance?.tearDownPeerConnection(notify = false)
                    NativeVoiceWebRtcEngine(context.applicationContext, normalizedBase, eventEmitter).also {
                        instance = it
                    }
                }
            }
        }

        fun endGlobal() {
            instance?.endCall(syncServer = false, reason = "shutdown")
            instance?.releaseFactory()
            instance = null
        }

        fun isHandlingCallId(callIdRaw: String): Boolean {
            val engine = instance ?: return false
            return engine.isHandlingCall(callIdRaw)
        }

        /** Read engine state without creating a new instance (PSTN containment). */
        fun peekIsActive(): Boolean = instance?.isActive() == true

        fun peekIsMediaConnected(): Boolean = instance?.isMediaConnected == true
    }

    private fun releaseFactory() {
        mainHandler.post {
            removeVideoOverlay()
            audioDeviceModule?.release()
            audioDeviceModule = null
            peerConnectionFactory?.dispose()
            peerConnectionFactory = null
            eglBase?.release()
            eglBase = null
        }
    }

    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val running = AtomicBoolean(false)

    private var peerConnectionFactory: PeerConnectionFactory? = null
    private var audioDeviceModule: JavaAudioDeviceModule? = null
    private var peerConnection: PeerConnection? = null
    private var audioSource: AudioSource? = null
    private var localAudioTrack: AudioTrack? = null
    private var videoSource: VideoSource? = null
    private var localVideoTrack: VideoTrack? = null
    private var remoteVideoTrack: VideoTrack? = null
    private var videoCapturer: VideoCapturer? = null
    private var eglBase: EglBase? = null
    private var surfaceTextureHelper: SurfaceTextureHelper? = null
    private var wantsVideo = false
    private var videoOverlayContainer: FrameLayout? = null
    private var callVideoDialog: Dialog? = null
    private var remoteRenderer: TextureViewRenderer? = null
    private var localRenderer: TextureViewRenderer? = null
    private var statusLabel: TextView? = null
    private var nameLabel: TextView? = null
    private var muteButton: ImageButton? = null
    private var speakerButton: ImageButton? = null
    private var uiMuted = false
    private var uiSpeakerOn = true

    private var callId: String? = null
    private var token: String? = null
    private var isCaller = false
    private var isAnswering = false
    @Volatile
    private var isMediaConnected = false
    @Volatile
    private var remoteIceEpoch = 0L
    private var pollSince = "1970-01-01T00:00:00.000Z"

    private val appliedRemoteIceKeys = mutableSetOf<String>()
    private val pendingRemoteIce = mutableListOf<JSONObject>()
    private var remoteDescriptionReady = false
    private var remoteAnswerApplied = false
    private var icePollGeneration: UUID? = null
    private var bootstrapGeneration: UUID? = null
    private var createAnswerGeneration: UUID? = null
    private var sessionPollGeneration: UUID? = null
    private var iceDisconnectRunnable: Runnable? = null
    private var cachedCaller: JSONObject? = null
    private var parsedIceServers: List<PeerConnection.IceServer> = defaultIceServers()
    /** One retry if createAnswer produced recvonly despite a local video track. */
    private var answerSendRecvRetryDone = false
    /** Cached from the remote offer — Safari sendonly cannot be answered as sendrecv. */
    private var offerVideoLooksSendRecv = true

    fun isActive(): Boolean = running.get() || peerConnection != null || isAnswering

    fun activeCallId(): String? = callId

    fun isHandlingCall(callIdRaw: String): Boolean {
        val normalized = callIdRaw.lowercase()
        return this.callId == normalized && (isAnswering || running.get() || peerConnection != null)
    }

    fun prepareAnswer(callIdRaw: String, declineToken: String?, remoteOfferSdp: String? = null, wantsVideo: Boolean = false) {
        val normalized = callIdRaw.lowercase()
        val newToken = declineToken?.trim()?.ifEmpty { null }
        val inlineOffer = remoteOfferSdp?.trim()?.takeIf { it.startsWith("v=") }
        this.wantsVideo = wantsVideo ||
            context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                .getBoolean("video_$normalized", false)
        if (this.wantsVideo) {
            context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("video_$normalized", true)
                .apply()
            requestCameraPermissionIfNeeded()
            ensureVideoCallUI("Connecting…")
        }

        if (isActive() && this.callId != normalized) {
            endCall(syncServer = false, reason = "superseded")
        }

        // Session bootstrap may have started without a token; upgrade when FCM token arrives.
        if (isAnswering && this.callId == normalized) {
            if (!newToken.isNullOrEmpty() && token.isNullOrEmpty()) {
                token = newToken
                bootstrapGeneration = null
                stopSessionPoll()
                appliedRemoteIceKeys.clear()
                remoteDescriptionReady = false
                remoteAnswerApplied = false
                pendingRemoteIce.clear()
                Log.i(TAG, "upgrade answer $normalized with decline token")
                executor.execute {
                    postNativeTrace(normalized, newToken!!, "native_webrtc_token_upgrade")
                    postNativeCallKit("accept", normalized, newToken)
                    if (inlineOffer != null) {
                        beginAnswerWithInlineOffer(normalized, inlineOffer)
                    } else {
                        bootstrapUntilOfferReady(normalized, newToken, attempt = 0)
                    }
                }
            } else if (inlineOffer != null) {
                bootstrapGeneration = null
                stopSessionPoll()
                appliedRemoteIceKeys.clear()
                remoteDescriptionReady = false
                remoteAnswerApplied = false
                pendingRemoteIce.clear()
                Log.i(TAG, "upgrade answer $normalized with inline offer")
                executor.execute {
                    beginAnswerWithInlineOffer(normalized, inlineOffer)
                }
            }
            return
        }
        if (isAnswering && this.callId == normalized) return

        this.callId = normalized
        this.token = newToken
        isCaller = false
        isAnswering = true
        isMediaConnected = false
        running.set(true)
        appliedRemoteIceKeys.clear()
        remoteDescriptionReady = false
        remoteAnswerApplied = false
        pendingRemoteIce.clear()
        cachedCaller = null

        Log.i(
            TAG,
            "prepare answer $normalized token=${!token.isNullOrEmpty()} inlineOffer=${inlineOffer != null}",
        )
        ensureVoiceCallAudioActive()
        executor.execute {
            if (inlineOffer != null) {
                postAnswerAccepted(normalized)
                beginAnswerWithInlineOffer(normalized, inlineOffer)
                return@execute
            }
            if (!token.isNullOrEmpty()) {
                postNativeTrace(normalized, token!!, "native_webrtc_prepare")
                postNativeCallKit("accept", normalized, token!!)
                bootstrapUntilOfferReady(normalized, token!!, attempt = 0)
            } else {
                postSessionAction("accept", normalized)
                bootstrapSessionOffer(normalized, attempt = 0)
            }
        }
    }

    fun startCaller(callIdRaw: String, iceServersJson: JSONArray?, wantsVideo: Boolean = false) {
        val normalized = callIdRaw.lowercase()
        if (isActive() && this.callId != normalized) {
            endCall(syncServer = false, reason = "superseded")
        }
        if (isCaller && this.callId == normalized && peerConnection != null) return

        this.callId = normalized
        this.token = null
        isCaller = true
        isAnswering = false
        isMediaConnected = false
        running.set(true)
        this.wantsVideo = wantsVideo ||
            context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                .getBoolean("video_$normalized", false)
        if (this.wantsVideo) {
            context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("video_$normalized", true)
                .apply()
            requestCameraPermissionIfNeeded()
            // Full-screen Dialog immediately — never paint black SurfaceView over WebView.
            ensureVideoCallUI("Calling…")
        }
        appliedRemoteIceKeys.clear()
        remoteDescriptionReady = false
        remoteAnswerApplied = false
        pendingRemoteIce.clear()
        cachedCaller = null
        parsedIceServers = parseIceServers(iceServersJson)

        Log.i(TAG, "start caller $normalized video=${this.wantsVideo}")
        runWebRtc("startCaller") {
            ensureVoiceCallAudioActive()
            createAndSendOffer(normalized)
        }
    }

    fun setMuted(muted: Boolean) {
        localAudioTrack?.setEnabled(!muted)
        // Also mute PC audio senders in case the local track ref was cleared.
        peerConnection?.senders?.forEach { sender ->
            val track = sender.track()
            if (track is AudioTrack) {
                track.setEnabled(!muted)
                localAudioTrack = track
            }
        }
    }

    fun endCall(syncServer: Boolean = true, reason: String = "user") {
        val id = callId
        val authToken = token
        cancelIceDisconnectTimer()
        stopIcePoll()
        stopSessionPoll()
        bootstrapGeneration = null
        isAnswering = false
        isCaller = false
        isMediaConnected = false
        running.set(false)

        if (syncServer && id != null) {
            executor.execute {
                if (!authToken.isNullOrEmpty()) {
                    postNativeCallKit("end", id, authToken)
                } else {
                    postSessionAction("end", id)
                }
            }
        }

        wantsVideo = false
        tearDownPeerConnection(notify = true)
        id?.let { endedId ->
            context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                .edit()
                .remove("video_${endedId.lowercase()}")
                .apply()
        }
        callId = null
        token = null
        cachedCaller = null
        Log.i(TAG, "end call ${id ?: "nil"} reason=$reason")
    }

    private fun runWebRtc(label: String, block: () -> Unit) {
        val task = Runnable {
            try {
                block()
            } catch (e: Exception) {
                Log.e(TAG, "$label failed", e)
                callId?.let { failCall(it, e.message ?: label) }
            }
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            task.run()
        } else {
            mainHandler.post(task)
        }
    }

    private fun ensureEgl(): EglBase {
        eglBase?.let { return it }
        return EglBase.create().also { eglBase = it }
    }

    private fun ensureFactory(): PeerConnectionFactory {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            throw IllegalStateException("WebRTC factory must be created on the main thread")
        }
        peerConnectionFactory?.let { return it }
        PeerConnectionFactory.initialize(
            PeerConnectionFactory.InitializationOptions.builder(context)
                .setEnableInternalTracer(false)
                .createInitializationOptions(),
        )
        val adm = JavaAudioDeviceModule.builder(context)
            .setUseHardwareAcousticEchoCanceler(true)
            .setUseHardwareNoiseSuppressor(true)
            .setAudioTrackStateCallback(object : JavaAudioDeviceModule.AudioTrackStateCallback {
                override fun onWebRtcAudioTrackStart() {
                    // Do not re-force speaker here — that overwrote user earpiece / JS setAudioRoute.
                    Log.i(TAG, "webrtc audio track start (route unchanged speakerPref=$uiSpeakerOn)")
                }

                override fun onWebRtcAudioTrackStop() {
                }
            })
            .createAudioDeviceModule()
        audioDeviceModule = adm
        val egl = ensureEgl()
        // Without encoder/decoder factories, video tracks negotiate but frames stay black.
        val encoderFactory = DefaultVideoEncoderFactory(egl.eglBaseContext, true, true)
        val decoderFactory = DefaultVideoDecoderFactory(egl.eglBaseContext)
        val factory = PeerConnectionFactory.builder()
            .setAudioDeviceModule(adm)
            .setVideoEncoderFactory(encoderFactory)
            .setVideoDecoderFactory(decoderFactory)
            .createPeerConnectionFactory()
        peerConnectionFactory = factory
        Log.i(TAG, "peerConnectionFactory ready with video codecs")
        return factory
    }

    private fun createPeerConnection(iceServers: List<PeerConnection.IceServer>): PeerConnection? {
        val config = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }
        return ensureFactory().createPeerConnection(config, this)
    }

    private fun attachLocalAudio(pc: PeerConnection) {
        val constraints = MediaConstraints()
        val source = ensureFactory().createAudioSource(constraints)
        val track = ensureFactory().createAudioTrack("audio0", source)
        track.setEnabled(true)
        pc.addTrack(track, listOf("stream0"))
        audioSource = source
        localAudioTrack = track
    }

    private fun attachLocalVideo(pc: PeerConnection) {
        if (!wantsVideo) return
        if (!hasCameraPermission()) {
            Log.w(TAG, "attach local video skipped — CAMERA permission not granted")
            requestCameraPermissionIfNeeded()
            // Retry after the system permission dialog (user may grant mid-call).
            listOf(800L, 2000L, 4500L).forEach { delayMs ->
                mainHandler.postDelayed({
                    if (!wantsVideo || localVideoTrack != null) return@postDelayed
                    val livePc = peerConnection ?: return@postDelayed
                    if (hasCameraPermission()) {
                        attachLocalVideo(livePc)
                        ensureVideoOverlay()
                    }
                }, delayMs)
            }
            return
        }
        if (localVideoTrack != null) {
            ensureVideoOverlay()
            scheduleRendererBindRetries()
            return
        }
        try {
            val capturer = createCameraCapturer() ?: run {
                Log.w(TAG, "attach local video — no camera capturer")
                return
            }
            val rootEgl = ensureEgl()
            val helper = SurfaceTextureHelper.create("CaptureThread", rootEgl.eglBaseContext)
            surfaceTextureHelper = helper
            val source = ensureFactory().createVideoSource(false)
            capturer.initialize(helper, resolveActivity() ?: context, source.capturerObserver)
            // Prefer 720p; fall back to 480p if the device rejects the format.
            try {
                capturer.startCapture(1280, 720, 30)
            } catch (err: Exception) {
                Log.w(TAG, "720p capture failed, trying 640x480: ${err.message}")
                capturer.startCapture(640, 480, 24)
            }
            val track = ensureFactory().createVideoTrack("video0", source)
            track.setEnabled(true)
            pc.addTrack(track, listOf("stream0"))
            videoCapturer = capturer
            videoSource = source
            localVideoTrack = track
            Log.i(TAG, "local video track attached sinks pending surface")
            ensureVideoSendRecv(pc)
            postClientTrace(
                "local_video_attached",
                JSONObject()
                    .put("cameraPermission", hasCameraPermission())
                    .put("hasLocalRenderer", localRenderer != null)
                    .put("isCaller", isCaller),
            )
            ensureVideoOverlay()
            scheduleRendererBindRetries()
        } catch (err: Exception) {
            Log.e(TAG, "attach local video failed", err)
            postClientTrace("local_video_failed", JSONObject().put("error", err.message ?: "unknown"))
        }
    }

    private fun createCameraCapturer(): VideoCapturer? {
        val camContext = resolveActivity() ?: context
        val camera2 = Camera2Enumerator(camContext)
        val camera2Name = camera2.deviceNames.firstOrNull { camera2.isFrontFacing(it) }
            ?: camera2.deviceNames.firstOrNull()
        if (camera2Name != null) {
            camera2.createCapturer(camera2Name, null)?.let {
                Log.i(TAG, "using Camera2 capturer $camera2Name")
                postClientTrace("camera2_selected", JSONObject().put("device", camera2Name))
                return it
            }
        }
        val camera1 = Camera1Enumerator(true)
        val camera1Name = camera1.deviceNames.firstOrNull { camera1.isFrontFacing(it) }
            ?: camera1.deviceNames.firstOrNull()
        if (camera1Name != null) {
            camera1.createCapturer(camera1Name, null)?.let {
                Log.i(TAG, "using Camera1 capturer $camera1Name")
                postClientTrace("camera1_selected", JSONObject().put("device", camera1Name))
                return it
            }
        }
        postClientTrace("camera_capturer_missing")
        return null
    }

    private fun hasCameraPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
            PackageManager.PERMISSION_GRANTED

    private fun requestCameraPermissionIfNeeded() {
        if (hasCameraPermission()) return
        val work = Runnable {
            if (hasCameraPermission()) return@Runnable
            val activity = resolveActivity()
            if (activity == null) {
                Log.w(TAG, "CAMERA permission request skipped — no activity")
                return@Runnable
            }
            ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.CAMERA), 0xA11C)
            Log.i(TAG, "requested CAMERA permission")
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            work.run()
        } else {
            mainHandler.post(work)
        }
    }

    private fun resolveActivity(): Activity? {
        CapacitorVoipCallsPlugin.getInstance()?.activity?.let { return it }
        var ctx: Context? = context
        while (ctx is ContextWrapper) {
            if (ctx is Activity) return ctx
            ctx = ctx.baseContext
        }
        return null
    }

    private fun dp(value: Int): Int =
        (value * context.resources.displayMetrics.density).toInt()

    /** App drawable ic_mic_off (mic + slash); avoid android silent/speaker icons. */
    private fun micOffIconRes(): Int {
        val id = context.resources.getIdentifier("ic_mic_off", "drawable", context.packageName)
        return if (id != 0) id else android.R.drawable.ic_btn_speak_now
    }

    /** Hide status + nav bars for full-screen video Dialog (sticky — swipe to peek). */
    private fun applyImmersiveVideoCallWindow(window: Window?) {
        window ?: return
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.attributes = window.attributes.apply {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }
        WindowCompat.setDecorFitsSystemWindows(window, false)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.statusBarColor = Color.TRANSPARENT
            window.navigationBarColor = Color.TRANSPARENT
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
            window.isStatusBarContrastEnforced = false
        }
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
    }

    private fun roundControlButton(
        activity: Activity,
        iconRes: Int,
        backgroundColor: Int,
        onClick: () -> Unit,
    ): ImageButton {
        val button = ImageButton(activity)
        button.setImageResource(iconRes)
        button.scaleType = android.widget.ImageView.ScaleType.CENTER_INSIDE
        button.setColorFilter(Color.WHITE)
        button.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(backgroundColor)
        }
        button.setOnClickListener { onClick() }
        val pad = dp(14)
        button.setPadding(pad, pad, pad, pad)
        return button
    }

    private fun refreshNativeControlAppearance() {
        muteButton?.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(
                if (uiMuted) Color.parseColor("#F59E0B")
                else Color.argb(56, 255, 255, 255),
            )
        }
        muteButton?.setImageResource(
            if (uiMuted) micOffIconRes()
            else android.R.drawable.ic_btn_speak_now,
        )
        speakerButton?.background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(
                if (uiSpeakerOn) Color.parseColor("#2563EB")
                else Color.argb(56, 255, 255, 255),
            )
        }
    }

    private fun setSpeakerphone(enabled: Boolean) {
        try {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.mode = AudioManager.MODE_IN_COMMUNICATION
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = enabled
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try {
                    val devices = am.availableCommunicationDevices
                    val target = if (enabled) {
                        devices.firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
                    } else {
                        devices.firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }
                    }
                    if (target != null) {
                        am.setCommunicationDevice(target)
                    } else if (!enabled) {
                        am.clearCommunicationDevice()
                    }
                } catch (err: Exception) {
                    Log.w(TAG, "setCommunicationDevice failed: ${err.message}")
                }
            }
        } catch (err: Exception) {
            Log.w(TAG, "speaker toggle failed: ${err.message}")
        }
        // Telecom Connection owns the real route — must flip both ways or OFF stays loud.
        if (enabled) {
            applyTelecomSpeakerRoute()
        } else {
            applyTelecomEarpieceRoute()
        }
    }

    /**
     * KakaoTalk-style full-screen native video UI (separate Dialog window).
     * Do NOT paint SurfaceView over Capacitor WebView — ZOrderMediaOverlay
     * covers JS controls with a black surface when frames are empty.
     */
    private fun ensureVideoOverlay() {
        ensureVideoCallUI(if (isMediaConnected) "Connected" else "Connecting…")
    }

    private fun ensureVideoCallUI(status: String) {
        if (!wantsVideo) return
        val work = Runnable {
            if (!wantsVideo) return@Runnable
            val activity = resolveActivity()
            if (activity == null || activity.isFinishing) {
                Log.w(TAG, "video UI skipped — no activity")
                return@Runnable
            }
            statusLabel?.text = status
            if (callVideoDialog?.isShowing == true) {
                applyImmersiveVideoCallWindow(callVideoDialog?.window)
                bindVideoRenderers()
                scheduleRendererBindRetries()
                return@Runnable
            }

            val egl = ensureEgl()
            val root = FrameLayout(activity).apply {
                // TextureView paints in-hierarchy; opaque root is fine (unlike SurfaceView holes).
                setBackgroundColor(Color.parseColor("#0A0A0A"))
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
            }

            val remote = TextureViewRenderer(activity).apply {
                init(egl.eglBaseContext)
                setMirror(false)
                onSurfaceReady = {
                    Log.i(TAG, "remote TextureView surface ready")
                    bindVideoRenderers()
                }
            }
            val local = TextureViewRenderer(activity).apply {
                init(egl.eglBaseContext)
                setMirror(true)
                onSurfaceReady = {
                    Log.i(TAG, "local TextureView surface ready")
                    postClientTrace("local_surface_ready")
                    bindVideoRenderers()
                }
            }
            root.addView(
                remote,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                ),
            )
            root.addView(
                local,
                FrameLayout.LayoutParams(dp(100), dp(140)).apply {
                    gravity = Gravity.TOP or Gravity.END
                    topMargin = dp(56)
                    marginEnd = dp(16)
                },
            )

            val displayName = cachedCaller?.optString("name")?.takeIf { it.isNotBlank() }
                ?: "AiMediaTank"
            val name = TextView(activity).apply {
                text = displayName
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 28f)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
                gravity = Gravity.CENTER
            }
            val statusView = TextView(activity).apply {
                text = status
                setTextColor(Color.argb(200, 255, 255, 255))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
                gravity = Gravity.CENTER
            }
            nameLabel = name
            statusLabel = statusView

            uiMuted = false
            uiSpeakerOn = true
            val speaker = roundControlButton(
                activity,
                android.R.drawable.ic_lock_silent_mode_off,
                Color.parseColor("#2563EB"),
            ) {
                uiSpeakerOn = !uiSpeakerOn
                setSpeakerphone(uiSpeakerOn)
                refreshNativeControlAppearance()
            }
            val end = roundControlButton(
                activity,
                android.R.drawable.ic_menu_call,
                Color.parseColor("#E53935"),
            ) {
                endCall(syncServer = true, reason = "user")
            }
            val mute = roundControlButton(
                activity,
                android.R.drawable.ic_btn_speak_now,
                Color.argb(56, 255, 255, 255),
            ) {
                uiMuted = !uiMuted
                setMuted(uiMuted)
                refreshNativeControlAppearance()
            }
            speakerButton = speaker
            muteButton = mute
            refreshNativeControlAppearance()

            fun controlColumn(button: ImageButton): LinearLayout {
                val col = LinearLayout(activity).apply {
                    orientation = LinearLayout.VERTICAL
                    gravity = Gravity.CENTER_HORIZONTAL
                }
                // Icon-only — no text labels (aligned with iOS video footer).
                col.addView(button, LinearLayout.LayoutParams(dp(64), dp(64)))
                return col
            }

            val controls = LinearLayout(activity).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER
                addView(controlColumn(speaker), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                addView(controlColumn(end), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                addView(controlColumn(mute), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
            }

            val chrome = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER_HORIZONTAL
                setBackgroundColor(Color.BLACK)
                setPadding(dp(24), dp(16), dp(24), dp(28))
                addView(
                    name,
                    LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ),
                )
                addView(
                    statusView,
                    LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ).apply { topMargin = dp(6); bottomMargin = dp(16) },
                )
                addView(
                    controls,
                    LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.WRAP_CONTENT,
                    ),
                )
            }
            root.addView(
                chrome,
                FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                ).apply { gravity = Gravity.BOTTOM },
            )

            val dialog = Dialog(activity, android.R.style.Theme_Black_NoTitleBar_Fullscreen)
            dialog.setCancelable(false)
            dialog.window?.setBackgroundDrawable(ColorDrawable(Color.BLACK))
            dialog.setContentView(
                root,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                ),
            )
            dialog.show()
            applyImmersiveVideoCallWindow(dialog.window)
            // Re-hide if the user swipes bars back into view.
            dialog.window?.decorView?.setOnSystemUiVisibilityChangeListener { flags ->
                val navVisible = flags and View.SYSTEM_UI_FLAG_HIDE_NAVIGATION == 0
                if (navVisible && callVideoDialog?.isShowing == true) {
                    applyImmersiveVideoCallWindow(dialog.window)
                }
            }
            callVideoDialog = dialog
            videoOverlayContainer = root
            remoteRenderer = remote
            localRenderer = local
            postClientTrace("video_dialog_shown")
            bindVideoRenderers()
            scheduleRendererBindRetries()
            Log.i(TAG, "native video call Dialog shown (TextureView, immersive)")
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            work.run()
        } else {
            mainHandler.post(work)
        }
    }

    private fun scheduleRendererBindRetries() {
        listOf(50L, 150L, 400L, 900L, 1800L, 3500L).forEach { delayMs ->
            mainHandler.postDelayed({
                if (!wantsVideo) return@postDelayed
                if (localVideoTrack == null && remoteVideoTrack == null) return@postDelayed
                bindVideoRenderers()
            }, delayMs)
        }
    }

    private fun bindVideoRenderers() {
        localVideoTrack?.let { track ->
            localRenderer?.let { renderer ->
                if (renderer.width <= 0 || renderer.height <= 0) {
                    Log.i(TAG, "bind local deferred — zero size ${renderer.width}x${renderer.height}")
                } else {
                    try {
                        track.removeSink(renderer)
                    } catch (_: Exception) {
                    }
                    track.setEnabled(true)
                    track.addSink(renderer)
                    Log.i(TAG, "local sink bound size=${renderer.width}x${renderer.height}")
                }
            }
        }
        remoteVideoTrack?.let { track ->
            remoteRenderer?.let { renderer ->
                if (renderer.width <= 0 || renderer.height <= 0) {
                    Log.i(TAG, "bind remote deferred — zero size ${renderer.width}x${renderer.height}")
                } else {
                    try {
                        track.removeSink(renderer)
                    } catch (_: Exception) {
                    }
                    track.setEnabled(true)
                    track.addSink(renderer)
                    Log.i(TAG, "remote sink bound size=${renderer.width}x${renderer.height}")
                }
            }
        }
    }

    /** Session or decline-token trace — appears in Azure Log Stream as [VoIP] native trace. */
    private fun postClientTrace(event: String, detail: JSONObject = JSONObject()) {
        val id = callId ?: return
        executor.execute {
            try {
                val body = JSONObject().apply {
                    put("callId", id.lowercase())
                    put("event", event)
                    put("source", "android_native_webrtc")
                    if (detail.length() > 0) put("detail", detail)
                    val auth = token
                    if (!auth.isNullOrEmpty()) put("token", auth)
                }
                httpPost("$baseUrl/api/chat/voice/native-trace", body, withCookies = true)
            } catch (e: Exception) {
                Log.w(TAG, "postClientTrace failed: ${e.message}")
            }
        }
    }

    private fun removeVideoOverlay() {
        val work = Runnable {
            localVideoTrack?.let { track ->
                localRenderer?.let { renderer ->
                    try {
                        track.removeSink(renderer)
                    } catch (_: Exception) {
                    }
                }
            }
            remoteVideoTrack?.let { track ->
                remoteRenderer?.let { renderer ->
                    try {
                        track.removeSink(renderer)
                    } catch (_: Exception) {
                    }
                }
            }
            try {
                localRenderer?.release()
            } catch (_: Exception) {
            }
            try {
                remoteRenderer?.release()
            } catch (_: Exception) {
            }
            localRenderer = null
            remoteRenderer = null
            statusLabel = null
            nameLabel = null
            muteButton = null
            speakerButton = null
            videoOverlayContainer = null
            remoteVideoTrack = null
            try {
                callVideoDialog?.window?.decorView?.setOnSystemUiVisibilityChangeListener(null)
                callVideoDialog?.dismiss()
            } catch (_: Exception) {
            }
            callVideoDialog = null
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            work.run()
            return
        }
        val done = java.util.concurrent.CountDownLatch(1)
        mainHandler.post {
            try {
                work.run()
            } finally {
                done.countDown()
            }
        }
        try {
            done.await(2, java.util.concurrent.TimeUnit.SECONDS)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }

    private fun createAndSendOffer(callId: String) {
        tearDownPeerConnection(notify = false)
        val pc = createPeerConnection(parsedIceServers)
        if (pc == null) {
            failCall(callId, "peer connection create failed")
            return
        }
        peerConnection = pc
        attachLocalAudio(pc)
        attachLocalVideo(pc)
        if (wantsVideo) {
            // Local preview while ringing — do not wait for remote answer / ICE.
            ensureVideoOverlay()
        }
        applyPreferredAudioRoute()
        localAudioTrack?.setEnabled(true)

        val constraints = MediaConstraints()
        if (wantsVideo) {
            constraints.mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveVideo", "true"))
        }
        constraints.mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
        pc.createOffer(object : SdpObserverAdapter() {
            override fun onCreateSuccess(desc: SessionDescription?) {
                if (desc == null) {
                    failCall(callId, "createOffer returned nil")
                    return
                }
                pc.setLocalDescription(object : SdpObserverAdapter() {
                    override fun onSetSuccess() {
                        val hasVideoM = desc.description?.contains("m=video") == true
                        Log.i(TAG, "posted offer sdp $callId hasVideoMLine=$hasVideoM wantsVideo=$wantsVideo")
                        val payload = JSONObject().apply {
                            put("sdp", JSONObject().apply {
                                put("type", sdpTypeString(desc.type))
                                put("sdp", desc.description)
                            })
                        }
                        postSessionSignal(callId, "offer", payload)
                        startSessionPoll(callId, asCaller = true)
                        if (wantsVideo) {
                            ensureVideoOverlay()
                        }
                    }

                    override fun onSetFailure(error: String?) {
                        failCall(callId, "setLocalDescription: $error")
                    }
                }, desc)
            }

            override fun onCreateFailure(error: String?) {
                failCall(callId, "createOffer: $error")
            }
        }, constraints)
    }

    private fun beginAnswerWithInlineOffer(callId: String, inlineOfferSdp: String) {
        val sdp = inlineOfferSdp.trim()
        if (!sdp.startsWith("v=")) {
            Log.w(TAG, "invalid inline offer for $callId prefix=${sdp.take(48)}")
            if (!token.isNullOrEmpty()) {
                bootstrapUntilOfferReady(callId, token!!, attempt = 0)
            } else {
                bootstrapSessionOffer(callId, attempt = 0)
            }
            return
        }
        val authToken = token
        if (authToken.isNullOrEmpty()) {
            beginAnswerWithOffer(callId, sdp, parsedIceServers)
            return
        }
        fetchNativeBootstrap(callId, authToken) { result ->
            if (!isAnswering || this.callId != callId) return@fetchNativeBootstrap
            result.onFailure { error ->
                Log.w(TAG, "inline offer bootstrap failed $callId: ${error.message}")
                beginAnswerWithOffer(callId, sdp, parsedIceServers)
            }.onSuccess { bootstrap ->
                bootstrap.caller?.let { cachedCaller = it }
                val iceServers = bootstrap.iceServers
                parsedIceServers = iceServers
                Log.i(
                    TAG,
                    "inline answer $callId iceServers=${iceServers.size} remoteIce=${bootstrap.remoteIce.size}",
                )
                val bootstrapOffer = bootstrap.offerSdp?.let { normalizeSdp(it) }?.takeIf { it.startsWith("v=") }
                val resolvedSdp = bootstrapOffer ?: normalizeSdp(sdp).takeIf { it.startsWith("v=") }
                if (resolvedSdp == null) {
                    failCall(callId, "offer missing")
                    return@onSuccess
                }
                val offerSource = if (bootstrapOffer != null) "bootstrap" else "inline"
                Log.i(TAG, "createAnswer offer $callId source=$offerSource len=${resolvedSdp.length}")
                runWebRtc("createAnswer") {
                    createAnswer(callId, resolvedSdp, iceServers, bootstrap.remoteIce)
                }
            }
        }
    }

    private fun beginAnswerWithOffer(
        callId: String,
        offerSdp: String,
        iceServers: List<PeerConnection.IceServer>,
    ) {
        val sdp = offerSdp.trim()
        if (!sdp.startsWith("v=")) {
            Log.w(TAG, "invalid offer for $callId prefix=${sdp.take(48)}")
            if (!token.isNullOrEmpty()) {
                bootstrapUntilOfferReady(callId, token!!, attempt = 0)
            } else {
                bootstrapSessionOffer(callId, attempt = 0)
            }
            return
        }
        runWebRtc("createAnswer") {
            createAnswer(callId, sdp, iceServers)
        }
    }

    private fun postAnswerAccepted(callId: String) {
        if (!token.isNullOrEmpty()) {
            postNativeTrace(callId, token!!, "native_webrtc_prepare")
            postNativeCallKit("accept", callId, token!!)
        } else {
            postSessionAction("accept", callId)
        }
    }

    private fun createAnswer(
        callId: String,
        offerSdp: String,
        iceServers: List<PeerConnection.IceServer>,
        initialRemoteIce: List<JSONObject> = emptyList(),
    ) {
        val sdp = normalizeSdp(offerSdp)
        if (!sdp.startsWith("v=") || sdp.startsWith("{")) {
            failCall(callId, "invalid offer sdp")
            return
        }
        val offerHasVideo = sdp.contains("m=video")
        val generation = UUID.randomUUID()
        // Do not clear wantsVideo here — tearDown only resets peer/media resources.
        tearDownPeerConnection(notify = false)
        answerSendRecvRetryDone = false
        offerVideoLooksSendRecv = !offerHasVideo || videoSectionIsSendRecv(sdp)
        if (offerHasVideo) {
            wantsVideo = true
            context.getSharedPreferences("amt_voice", Context.MODE_PRIVATE)
                .edit()
                .putBoolean("video_${callId.lowercase()}", true)
                .apply()
            requestCameraPermissionIfNeeded()
        }
        createAnswerGeneration = generation
        applyPreferredAudioRoute()
        val pc = createPeerConnection(iceServers)
        if (pc == null) {
            failCall(callId, "peer connection create failed")
            return
        }
        peerConnection = pc
        attachLocalAudio(pc)
        // Attach video only AFTER setRemoteDescription (Unified Plan / iOS parity).

        val offer = SessionDescription(SessionDescription.Type.OFFER, sdp)
        val descLen = offer.description?.length ?: 0
        val offerDir = videoSectionDirection(sdp)
        Log.i(TAG, "setRemoteDescription $callId descLen=$descLen video=$wantsVideo offerDir=$offerDir prefix=${sdp.take(48).replace("\n", "\\n")}")
        postClientTrace(
            "remote_offer",
            JSONObject()
                .put("hasVideo", offerHasVideo)
                .put("videoDirection", offerDir)
                .put("sdpLen", descLen),
        )
        if (descLen == 0) {
            failCall(callId, "SessionDescription description empty")
            return
        }
        pc.setRemoteDescription(object : SdpObserverAdapter() {
            override fun onSetSuccess() {
                if (createAnswerGeneration != generation) return
                remoteDescriptionReady = true
                for (candidate in initialRemoteIce) {
                    addRemoteIceCandidate(candidate, callId)
                }
                flushPendingRemoteIce(callId)
                attachLocalVideo(pc)
                ensureVideoSendRecv(pc)
                // iPhone callers need sendrecv in the answer. If camera is still starting,
                // wait briefly so we do not answer recvonly (black remote on iPhone).
                if (wantsVideo && localVideoTrack == null) {
                    postClientTrace("answer_waiting_local_video")
                    mainHandler.postDelayed({
                        if (createAnswerGeneration != generation) return@postDelayed
                        attachLocalVideo(pc)
                        ensureVideoSendRecv(pc)
                        createAnswerSdp(pc, callId, generation)
                    }, 1200)
                    return
                }
                createAnswerSdp(pc, callId, generation)
            }

            override fun onSetFailure(error: String?) {
                if (createAnswerGeneration != generation) return
                Log.e(TAG, "setRemoteDescription $callId len=${sdp.length} err=$error")
                failCall(callId, "setRemoteDescription: $error")
            }
        }, offer)
    }

    /** Force Unified Plan video transceiver to send+receive (iOS parity). */
    private fun ensureVideoSendRecv(pc: PeerConnection) {
        if (!wantsVideo) return
        for (transceiver in pc.transceivers) {
            if (transceiver.mediaType == MediaStreamTrack.MediaType.MEDIA_TYPE_VIDEO) {
                try {
                    transceiver.direction = RtpTransceiver.RtpTransceiverDirection.SEND_RECV
                    Log.i(TAG, "video transceiver direction=SEND_RECV")
                } catch (err: Exception) {
                    Log.w(TAG, "set video SEND_RECV failed: ${err.message}")
                }
            }
        }
    }

    private fun createAnswerSdp(pc: PeerConnection, callId: String, generation: UUID) {
        ensureVideoSendRecv(pc)
        val constraints = MediaConstraints().apply {
            mandatory.add(MediaConstraints.KeyValuePair("OfferToReceiveAudio", "true"))
            mandatory.add(
                MediaConstraints.KeyValuePair(
                    "OfferToReceiveVideo",
                    if (wantsVideo) "true" else "false",
                ),
            )
        }
        pc.createAnswer(object : SdpObserverAdapter() {
            override fun onCreateSuccess(desc: SessionDescription?) {
                if (createAnswerGeneration != generation) return
                if (desc == null) {
                    failCall(callId, "createAnswer returned nil")
                    return
                }
                val answerSdp = desc.description ?: ""
                val hasVideoM = answerSdp.contains("m=video")
                val sendRecv = hasVideoM && videoSectionIsSendRecv(answerSdp)
                // Prefer waiting for a real sendrecv answer over posting recvonly (black remote on iPhone).
                if (wantsVideo && localVideoTrack != null && !sendRecv && !answerSendRecvRetryDone) {
                    answerSendRecvRetryDone = true
                    ensureVideoSendRecv(pc)
                    postClientTrace("answer_retry_sendrecv")
                    mainHandler.postDelayed({
                        if (createAnswerGeneration != generation) return@postDelayed
                        createAnswerSdp(pc, callId, generation)
                    }, 400)
                    return
                }
                pc.setLocalDescription(object : SdpObserverAdapter() {
                    override fun onSetSuccess() {
                        if (createAnswerGeneration != generation) return
                        Log.i(
                            TAG,
                            "posted answer sdp $callId hasVideoMLine=$hasVideoM sendRecv=$sendRecv localTrack=${localVideoTrack != null}",
                        )
                        postClientTrace(
                            "answer_sdp",
                            JSONObject()
                                .put("hasVideoMLine", hasVideoM)
                                .put("sendRecv", sendRecv)
                                .put("localVideoTrack", localVideoTrack != null)
                                .put("offerVideoSendRecv", offerVideoLooksSendRecv),
                        )
                        val payload = JSONObject().apply {
                            put("sdp", JSONObject().apply {
                                put("type", sdpTypeString(desc.type))
                                put("sdp", answerSdp)
                            })
                        }
                        if (!token.isNullOrEmpty()) {
                            postNativeSignal(callId, token!!, "answer", payload)
                        } else {
                            postSessionSignal(callId, "answer", payload)
                        }
                        if (!token.isNullOrEmpty()) {
                            startIcePoll(callId, token!!)
                        } else {
                            startSessionPoll(callId, asCaller = false)
                        }
                        if (wantsVideo) {
                            ensureVideoOverlay()
                            scheduleRendererBindRetries()
                        }
                    }

                    override fun onSetFailure(error: String?) {
                        if (createAnswerGeneration != generation) return
                        failCall(callId, "setLocalDescription: $error")
                    }
                }, desc)
            }

            override fun onCreateFailure(error: String?) {
                if (createAnswerGeneration != generation) return
                failCall(callId, "createAnswer: $error")
            }
        }, constraints)
    }

    private fun videoSectionIsSendRecv(sdp: String): Boolean {
        val idx = sdp.indexOf("m=video")
        if (idx < 0) return false
        val next = sdp.indexOf("\nm=", idx + 1)
        val section = if (next < 0) sdp.substring(idx) else sdp.substring(idx, next)
        return section.contains("a=sendrecv") ||
            (section.contains("a=sendonly").not() &&
                section.contains("a=recvonly").not() &&
                section.contains("a=inactive").not())
    }

    private fun videoSectionDirection(sdp: String): String {
        val idx = sdp.indexOf("m=video")
        if (idx < 0) return "none"
        val next = sdp.indexOf("\nm=", idx + 1)
        val section = if (next < 0) sdp.substring(idx) else sdp.substring(idx, next)
        return when {
            section.contains("a=sendrecv") -> "sendrecv"
            section.contains("a=sendonly") -> "sendonly"
            section.contains("a=recvonly") -> "recvonly"
            section.contains("a=inactive") -> "inactive"
            else -> "default_sendrecv"
        }
    }

    private fun applyRemoteAnswer(callId: String, answerSdp: String) {
        if (remoteAnswerApplied) return
        runWebRtc("applyAnswer") {
            if (remoteAnswerApplied) return@runWebRtc
            val pc = peerConnection ?: return@runWebRtc
            if (this.callId != callId) return@runWebRtc
            val sdp = normalizeSdp(answerSdp)
            val answer = SessionDescription(SessionDescription.Type.ANSWER, sdp)
            pc.setRemoteDescription(object : SdpObserverAdapter() {
                override fun onSetSuccess() {
                    remoteDescriptionReady = true
                    flushPendingRemoteIce(callId)
                    remoteAnswerApplied = true
                    localAudioTrack?.setEnabled(true)
                    applyPreferredAudioRoute()
                    if (isCaller) {
                        // Keep session poll until markConnected — PC trickle ICE arrives AFTER
                        // the answer SDP. Stopping here dropped candidates and killed mobile→PC
                        // calls ~1s after Accept (PC→mobile was fine as callee).
                        injectUiEvent(
                            "aimediatank-native-call-negotiating",
                            JSONObject().put("callId", callId.lowercase()),
                        )
                    }
                    Log.i(TAG, "applied remote answer $callId")
                }

                override fun onSetFailure(error: String?) {
                    Log.w(TAG, "setRemote answer failed $callId: $error")
                }
            }, answer)
        }
    }

    private fun bootstrapUntilOfferReady(callId: String, authToken: String, attempt: Int) {
        val generation = UUID.randomUUID()
        bootstrapGeneration = generation
        fetchNativeBootstrap(callId, authToken) { result ->
            if (bootstrapGeneration != generation) return@fetchNativeBootstrap
            if (!isAnswering || this.callId != callId) return@fetchNativeBootstrap

            result.onFailure { error ->
                if (attempt < 60) {
                    mainHandler.postDelayed({
                        bootstrapUntilOfferReady(callId, authToken, attempt + 1)
                    }, 500)
                } else {
                    failCall(callId, error.message ?: "bootstrap failed")
                }
            }.onSuccess { bootstrap ->
                bootstrap.caller?.let { cachedCaller = it }
                val offer = bootstrap.offerSdp
                if (offer.isNullOrEmpty()) {
                    if (attempt < 60) {
                        mainHandler.postDelayed({
                            bootstrapUntilOfferReady(callId, authToken, attempt + 1)
                        }, 500)
                    } else {
                        failCall(callId, "offer missing")
                    }
                    return@fetchNativeBootstrap
                }
                val offerSdp = offer
                runWebRtc("createAnswer") {
                    createAnswer(callId, offerSdp, bootstrap.iceServers, bootstrap.remoteIce)
                }
            }
        }
    }

    private fun bootstrapSessionOffer(callId: String, attempt: Int) {
        val generation = UUID.randomUUID()
        bootstrapGeneration = generation
        fetchSessionPoll { result ->
            if (bootstrapGeneration != generation) return@fetchSessionPoll
            if (!isAnswering || this.callId != callId) return@fetchSessionPoll

            result.onFailure { error ->
                if (attempt < 60) {
                    mainHandler.postDelayed({ bootstrapSessionOffer(callId, attempt + 1) }, 500)
                } else {
                    failCall(callId, error.message ?: "session poll failed")
                }
            }.onSuccess { poll ->
                val offerSdp = poll.signals
                    .firstOrNull { it.callId.equals(callId, ignoreCase = true) && it.type == "offer" }
                    ?.let { extractSdp(it.payload) }
                if (offerSdp.isNullOrEmpty()) {
                    if (attempt < 60) {
                        mainHandler.postDelayed({ bootstrapSessionOffer(callId, attempt + 1) }, 500)
                    } else {
                        failCall(callId, "offer missing")
                    }
                    return@fetchSessionPoll
                }
                val resolvedOfferSdp = offerSdp
                val pendingIce = mutableListOf<JSONObject>()
                runWebRtc("createAnswer") {
                    for (signal in poll.signals) {
                        if (!signal.callId.equals(callId, ignoreCase = true)) continue
                        if (signal.type != "ice") continue
                        extractCandidate(signal.payload)?.let { pendingIce.add(it) }
                    }
                    createAnswer(callId, resolvedOfferSdp, parsedIceServers, pendingIce)
                }
            }
        }
    }

    private fun startIcePoll(callId: String, authToken: String) {
        stopIcePoll()
        val generation = UUID.randomUUID()
        icePollGeneration = generation

        fun poll() {
            if (icePollGeneration != generation) return
            if (peerConnection == null || isMediaConnected) return
            fetchNativeBootstrap(callId, authToken) { result ->
                if (icePollGeneration != generation) return@fetchNativeBootstrap
                if (isMediaConnected) return@fetchNativeBootstrap
                result.onSuccess { bootstrap ->
                    if (icePollGeneration != generation || isMediaConnected) return@onSuccess
                    runWebRtc("icePoll") {
                        if (icePollGeneration != generation) return@runWebRtc
                        if (isMediaConnected) return@runWebRtc
                        for (candidate in bootstrap.remoteIce) {
                            addRemoteIceCandidate(candidate, callId)
                        }
                    }
                }
                if (icePollGeneration == generation && !isMediaConnected) {
                    mainHandler.postDelayed({ poll() }, 350)
                }
            }
        }
        poll()
    }

    private fun stopIcePoll() {
        icePollGeneration = null
    }

    private fun startSessionPoll(callId: String, asCaller: Boolean) {
        stopSessionPoll()
        val generation = UUID.randomUUID()
        sessionPollGeneration = generation

        fun poll() {
            if (sessionPollGeneration != generation) return
            if (peerConnection == null || isMediaConnected) return
            fetchSessionPoll { result ->
                if (sessionPollGeneration != generation) return@fetchSessionPoll
                if (isMediaConnected) return@fetchSessionPoll
                result.onSuccess { pollData ->
                    if (sessionPollGeneration != generation || isMediaConnected) return@onSuccess
                    runWebRtc("sessionPoll") {
                        if (sessionPollGeneration != generation) return@runWebRtc
                        if (peerConnection == null || isMediaConnected) return@runWebRtc
                        val callSignals = pollData.signals.filter {
                            it.callId.equals(callId, ignoreCase = true)
                        }
                        for (signal in callSignals) {
                            if (signal.type == "answer" && asCaller && !remoteAnswerApplied) {
                                extractSdp(signal.payload)?.let { applyRemoteAnswer(callId, it) }
                                continue
                            }
                            if (signal.type != "ice") continue
                            if (!shouldProcessRemoteIce()) continue
                            extractCandidate(signal.payload)?.let { addRemoteIceCandidate(it, callId) }
                        }
                        if (pollData.maxCreatedAt.isNotEmpty()) {
                            pollSince = pollData.maxCreatedAt
                        }
                    }
                }
                if (sessionPollGeneration == generation && !isMediaConnected) {
                    mainHandler.postDelayed({ poll() }, 350)
                }
            }
        }
        poll()
    }

    private fun stopSessionPoll() {
        sessionPollGeneration = null
    }

    private fun invalidateRemoteIceProcessing() {
        remoteIceEpoch++
        pendingRemoteIce.clear()
    }

    private fun flushPendingRemoteIce(callId: String) {
        if (pendingRemoteIce.isEmpty() || !shouldProcessRemoteIce()) return
        val queued = pendingRemoteIce.distinctBy { iceCandidateKey(it) }
        pendingRemoteIce.clear()
        for (candidate in queued) {
            addRemoteIceCandidate(candidate, callId)
        }
    }

    private fun shouldProcessRemoteIce(): Boolean {
        if (isMediaConnected) return false
        val pc = peerConnection ?: return false
        return canAcceptRemoteIce(pc)
    }

    private fun canAcceptRemoteIce(pc: PeerConnection): Boolean {
        return when (pc.iceConnectionState()) {
            PeerConnection.IceConnectionState.CONNECTED,
            PeerConnection.IceConnectionState.COMPLETED,
            PeerConnection.IceConnectionState.CLOSED,
            PeerConnection.IceConnectionState.FAILED,
            -> false
            else -> true
        }
    }

    private fun addRemoteIceCandidate(dict: JSONObject, callId: String) {
        // Do not gate on remoteAnswerApplied — PC posts trickle ICE after its answer.
        // Dedup via appliedRemoteIceKeys (avoids the old replay SIGABRT).
        if (!shouldProcessRemoteIce()) return
        val epoch = remoteIceEpoch
        val key = iceCandidateKey(dict)
        if (appliedRemoteIceKeys.contains(key)) return
        if (!remoteDescriptionReady) {
            pendingRemoteIce.add(dict)
            return
        }
        val sdp = dict.optString("candidate", "")
        if (sdp.isEmpty()) return
        val sdpMid = dict.optString("sdpMid", "").ifEmpty { null }
        val mLineIndex = dict.optInt("sdpMLineIndex", 0)

        val task = Runnable {
            if (epoch != remoteIceEpoch) return@Runnable
            if (!shouldProcessRemoteIce()) return@Runnable
            val pc = peerConnection ?: return@Runnable
            if (this.callId != callId) return@Runnable
            if (pc.remoteDescription == null) {
                pendingRemoteIce.add(dict)
                return@Runnable
            }
            if (!canAcceptRemoteIce(pc)) return@Runnable
            if (!appliedRemoteIceKeys.add(key)) return@Runnable
            val candidate = IceCandidate(sdpMid, mLineIndex, sdp)
            pc.addIceCandidate(candidate, object : AddIceObserver {
                override fun onAddSuccess() {}

                override fun onAddFailure(error: String) {
                    appliedRemoteIceKeys.remove(key)
                    Log.w(TAG, "addIceCandidate failed $callId: $error")
                }
            })
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            task.run()
        } else {
            mainHandler.post(task)
        }
    }

    private fun iceCandidateKey(dict: JSONObject): String {
        val sdp = dict.optString("candidate", "")
        val mid = dict.optString("sdpMid", "")
        val idx = dict.optInt("sdpMLineIndex", -1)
        return "$idx|$mid|$sdp"
    }

    private fun tearDownPeerConnection(notify: Boolean) {
        createAnswerGeneration = null
        stopIcePoll()
        stopSessionPoll()
        remoteDescriptionReady = false
        remoteAnswerApplied = false
        pendingRemoteIce.clear()
        invalidateRemoteIceProcessing()
        localAudioTrack?.dispose()
        localAudioTrack = null
        audioSource?.dispose()
        audioSource = null
        try {
            videoCapturer?.stopCapture()
        } catch (_: Exception) {
        }
        videoCapturer?.dispose()
        videoCapturer = null
        // Detach sinks before disposing tracks.
        removeVideoOverlay()
        localVideoTrack?.dispose()
        localVideoTrack = null
        videoSource?.dispose()
        videoSource = null
        surfaceTextureHelper?.dispose()
        surfaceTextureHelper = null
        // Keep eglBase for PeerConnectionFactory encoder/decoder across calls.
        // Keep wantsVideo for this call — reset only in endCall/failCall (iOS parity).
        peerConnection?.close()
        peerConnection = null
        if (notify) {
            val id = callId
            if (id != null) {
                emitEnded(id)
                injectUiEvent("aimediatank-callkit-end", JSONObject().put("callId", id))
            }
        }
    }

    private fun ensureVoiceCallAudioActive() {
        val activate = Runnable {
            val callManager = CapacitorVoipCallsPlugin.getInstance()?.callManager ?: return@Runnable
            callManager.setVoiceCallAudioActive(true)
            applyPreferredAudioRoute()
        }
        if (Looper.myLooper() == Looper.getMainLooper()) {
            activate.run()
        } else {
            mainHandler.post(activate)
        }
    }

    private fun applyPreferredAudioRoute() {
        val callManager = CapacitorVoipCallsPlugin.getInstance()?.callManager
        val preferEarpiece =
            !uiSpeakerOn || callManager?.preferredAudioRoute == "earpiece"
        if (preferEarpiece) {
            applyTelecomEarpieceRoute()
        } else {
            applyTelecomSpeakerRoute()
        }
    }

    private fun applyTelecomSpeakerRoute() {
        val callManager = CapacitorVoipCallsPlugin.getInstance()?.callManager ?: return
        callManager.applyTelecomSpeakerRoute()
    }

    private fun applyTelecomEarpieceRoute() {
        val callManager = CapacitorVoipCallsPlugin.getInstance()?.callManager
        if (callManager != null) {
            callManager.applyTelecomEarpieceRoute()
            return
        }
        try {
            val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
            am.mode = AudioManager.MODE_IN_COMMUNICATION
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = false
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val earpiece = am.availableCommunicationDevices
                    .firstOrNull { it.type == android.media.AudioDeviceInfo.TYPE_BUILTIN_EARPIECE }
                if (earpiece != null) {
                    am.setCommunicationDevice(earpiece)
                }
            }
        } catch (err: Exception) {
            Log.w(TAG, "earpiece fallback failed: ${err.message}")
        }
    }

    private fun failCall(callId: String, error: String) {
        Log.e(TAG, "failed $callId: $error")
        token?.let { postNativeTrace(callId, it, "native_webrtc_failed", JSONObject().put("error", error)) }
        val authToken = token
        cancelIceDisconnectTimer()
        isAnswering = false
        bootstrapGeneration = null
        running.set(false)
        wantsVideo = false
        tearDownPeerConnection(notify = false)
        emitFailed(callId, error)
        injectUiEvent("aimediatank-callkit-end", JSONObject().put("callId", callId))
        if (!authToken.isNullOrEmpty()) {
            executor.execute { postNativeCallKit("end", callId, authToken) }
        } else {
            executor.execute { postSessionAction("end", callId) }
        }
        this.callId = null
        token = null
    }

    private fun cancelIceDisconnectTimer() {
        iceDisconnectRunnable?.let { mainHandler.removeCallbacks(it) }
        iceDisconnectRunnable = null
    }

    private fun scheduleIceDisconnectFail(callId: String) {
        cancelIceDisconnectTimer()
        val runnable = Runnable {
            iceDisconnectRunnable = null
            if (this.callId != callId) return@Runnable
            if (!isMediaConnected && peerConnection == null) return@Runnable
            failCall(callId, "ICE disconnected")
        }
        iceDisconnectRunnable = runnable
        mainHandler.postDelayed(runnable, 8000)
    }

    private fun markConnected(callId: String) {
        if (!isAnswering && peerConnection == null && !isCaller) return
        if (isMediaConnected) return
        cancelIceDisconnectTimer()
        invalidateRemoteIceProcessing()
        isMediaConnected = true
        isAnswering = false
        bootstrapGeneration = null
        stopIcePoll()
        stopSessionPoll()
        running.set(true)
        Log.i(TAG, "connected $callId")
        token?.let { postNativeTrace(callId, it, "native_webrtc_connected") }
        if (wantsVideo) {
            ensureVideoCallUI("Connected")
            mainHandler.post {
                bindVideoRenderers()
                scheduleRendererBindRetries()
            }
        }
        mainHandler.post {
            val callManager = CapacitorVoipCallsPlugin.getInstance()?.callManager ?: return@post
            callManager.setVoiceCallAudioActive(true)
            callManager.setVoiceCallMediaVolume(1.0f)
            applyPreferredAudioRoute()
        }
        emitConnected(callId, cachedCaller)
        scheduleConnectedUiSync(callId, cachedCaller)
    }

    private fun scheduleConnectedUiSync(callId: String, caller: JSONObject?) {
        val delays = longArrayOf(0, 1000, 3000, 8000)
        for (delay in delays) {
            mainHandler.postDelayed({
                if (!isMediaConnected || this.callId != callId) return@postDelayed
                injectNativeConnected(callId, caller)
            }, delay)
        }
    }

    // PeerConnection.Observer

    override fun onSignalingChange(state: PeerConnection.SignalingState?) {}
    override fun onIceConnectionReceivingChange(receiving: Boolean) {}
    override fun onIceGatheringChange(state: PeerConnection.IceGatheringState?) {}
    override fun onAddStream(stream: MediaStream?) {}
    override fun onRemoveStream(stream: MediaStream?) {}
    override fun onDataChannel(channel: DataChannel?) {}
    override fun onRenegotiationNeeded() {}
    override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {
        val track = receiver?.track() ?: return
        if (track is AudioTrack) {
            track.setEnabled(true)
            Log.i(TAG, "remote RTP audio track enabled")
            return
        }
        if (track is VideoTrack) {
            track.setEnabled(true)
            remoteVideoTrack = track
            Log.i(TAG, "remote RTP video track")
            ensureVideoCallUI(if (isMediaConnected) "Connected" else "Connecting…")
            mainHandler.post { bindVideoRenderers() }
        }
    }
    override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}

    override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
        val id = callId ?: return
        Log.i(TAG, "ice state $id: $state")
        when (state) {
            PeerConnection.IceConnectionState.CONNECTED,
            PeerConnection.IceConnectionState.COMPLETED,
            -> {
                cancelIceDisconnectTimer()
                markConnected(id)
            }
            PeerConnection.IceConnectionState.FAILED -> failCall(id, "ICE failed")
            PeerConnection.IceConnectionState.CHECKING ->
                token?.let { postNativeTrace(id, it, "native_webrtc_ice_checking") }
            PeerConnection.IceConnectionState.DISCONNECTED -> {
                token?.let { postNativeTrace(id, it, "native_webrtc_ice_disconnected") }
                scheduleIceDisconnectFail(id)
            }
            else -> {}
        }
    }

    override fun onIceCandidate(candidate: IceCandidate?) {
        val id = callId ?: return
        val c = candidate ?: return
        val payload = JSONObject().apply {
            put("candidate", JSONObject().apply {
                put("candidate", c.sdp)
                put("sdpMLineIndex", c.sdpMLineIndex)
                if (!c.sdpMid.isNullOrEmpty()) put("sdpMid", c.sdpMid)
            })
        }
        if (!token.isNullOrEmpty()) {
            postNativeSignal(id, token!!, "ice", payload)
        } else {
            postSessionSignal(id, "ice", payload)
        }
    }

    // HTTP

    private data class BootstrapData(
        val offerSdp: String?,
        val iceServers: List<PeerConnection.IceServer>,
        val remoteIce: List<JSONObject>,
        val caller: JSONObject?,
    )

    private data class PollSignal(
        val callId: String,
        val type: String,
        val payload: JSONObject,
    )

    private data class SessionPollData(
        val signals: List<PollSignal>,
        val maxCreatedAt: String,
    )

    private fun fetchNativeBootstrap(callId: String, authToken: String, callback: (Result<BootstrapData>) -> Unit) {
        executor.execute {
            try {
                val url = "$baseUrl/api/chat/voice/native-callkit?callId=${encode(callId)}&token=${encode(authToken)}"
                val (code, body) = httpGet(url)
                if (code != 200 || body.isNullOrEmpty()) {
                    callback(Result.failure(Exception("bootstrap HTTP $code")))
                    return@execute
                }
                val json = JSONObject(body)
                val offerSdp = extractSdp(json.opt("offer"))
                val iceServers = parseIceServers(json.optJSONArray("iceServers"))
                val remoteIce = mutableListOf<JSONObject>()
                val rows = json.optJSONArray("iceCandidates")
                if (rows != null) {
                    for (i in 0 until rows.length()) {
                        val row = rows.optJSONObject(i) ?: continue
                        extractCandidate(row.opt("candidate"))?.let { remoteIce.add(it) }
                    }
                }
                val caller = json.optJSONObject("caller")
                callback(Result.success(BootstrapData(offerSdp, iceServers, remoteIce, caller)))
            } catch (e: Exception) {
                callback(Result.failure(e))
            }
        }
    }

    private fun fetchSessionPoll(callback: (Result<SessionPollData>) -> Unit) {
        executor.execute {
            try {
                val url = "$baseUrl/api/chat/voice?since=${encode(pollSince)}"
                val (code, body) = httpGet(url)
                if (code != 200 || body.isNullOrEmpty()) {
                    callback(Result.failure(Exception("session poll HTTP $code")))
                    return@execute
                }
                val json = JSONObject(body)
                val signals = mutableListOf<PollSignal>()
                var maxCreatedAt = pollSince
                val rows = json.optJSONArray("signals")
                if (rows != null) {
                    for (i in 0 until rows.length()) {
                        val row = rows.optJSONObject(i) ?: continue
                        val createdAt = row.optString("createdAt", "")
                        if (createdAt.isNotEmpty() && createdAt > maxCreatedAt) {
                            maxCreatedAt = createdAt
                        }
                        val payload = row.optJSONObject("payload") ?: JSONObject()
                        signals.add(
                            PollSignal(
                                callId = row.optString("callId", ""),
                                type = row.optString("type", ""),
                                payload = payload,
                            ),
                        )
                    }
                }
                callback(Result.success(SessionPollData(signals, maxCreatedAt)))
            } catch (e: Exception) {
                callback(Result.failure(e))
            }
        }
    }

    private fun postNativeCallKit(action: String, callId: String, authToken: String, extra: JSONObject = JSONObject()) {
        val body = JSONObject().apply {
            put("action", action)
            put("callId", callId.lowercase())
            put("token", authToken)
            for (key in extra.keys()) {
                put(key, extra.get(key))
            }
        }
        httpPost("$baseUrl/api/chat/voice/native-callkit", body, withCookies = false)
    }

    private fun postNativeSignal(callId: String, authToken: String, type: String, payload: JSONObject) {
        postNativeCallKit(
            "signal",
            callId,
            authToken,
            JSONObject().apply {
                put("type", type)
                put("payload", payload)
            },
        )
    }

    private fun postNativeTrace(callId: String, authToken: String, event: String, detail: JSONObject = JSONObject()) {
        val body = JSONObject().apply {
            put("callId", callId.lowercase())
            put("token", authToken)
            put("source", "android_native_webrtc")
            put("event", event)
            if (detail.length() > 0) put("detail", detail)
        }
        httpPost("$baseUrl/api/chat/voice/native-trace", body, withCookies = false)
    }

    private fun postSessionAction(action: String, callId: String) {
        val body = JSONObject().apply {
            put("action", action)
            put("callId", callId.lowercase())
        }
        httpPost("$baseUrl/api/chat/voice", body, withCookies = true)
    }

    private fun postSessionSignal(callId: String, type: String, payload: JSONObject) {
        val body = JSONObject().apply {
            put("action", "signal")
            put("callId", callId.lowercase())
            put("type", type)
            put("payload", payload)
        }
        httpPost("$baseUrl/api/chat/voice", body, withCookies = true)
    }

    private fun httpGet(urlString: String): Pair<Int, String?> {
        val conn = openConnection(urlString, "GET", withCookies = true)
        return readResponse(conn)
    }

    private fun httpPost(urlString: String, body: JSONObject, withCookies: Boolean) {
        try {
            val conn = openConnection(urlString, "POST", withCookies)
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            OutputStreamWriter(conn.outputStream).use { it.write(body.toString()) }
            readResponse(conn)
        } catch (e: Exception) {
            Log.w(TAG, "httpPost failed $urlString", e)
        }
    }

    private fun openConnection(urlString: String, method: String, withCookies: Boolean): HttpURLConnection {
        val conn = URL(urlString).openConnection() as HttpURLConnection
        conn.requestMethod = method
        conn.connectTimeout = 15000
        conn.readTimeout = 15000
        if (withCookies) {
            val cookies = CookieManager.getInstance().getCookie(baseUrl)
            if (!cookies.isNullOrEmpty()) {
                conn.setRequestProperty("Cookie", cookies)
            }
        }
        return conn
    }

    private fun readResponse(conn: HttpURLConnection): Pair<Int, String?> {
        return try {
            val code = conn.responseCode
            val stream = if (code in 200..299) conn.inputStream else conn.errorStream
            val body = stream?.let {
                BufferedReader(InputStreamReader(it)).use { reader -> reader.readText() }
            }
            Pair(code, body)
        } finally {
            conn.disconnect()
        }
    }

    // UI events

    private fun emitConnected(callId: String, caller: JSONObject?) {
        val data = JSObject().apply {
            put("callId", callId)
            caller?.let { put("caller", JSObject(it.toString())) }
        }
        eventEmitter("nativeVoiceWebRtcConnected", data)
    }

    private fun emitFailed(callId: String, error: String) {
        val data = JSObject().apply {
            put("callId", callId)
            put("error", error)
        }
        eventEmitter("nativeVoiceWebRtcFailed", data)
    }

    private fun emitEnded(callId: String) {
        val data = JSObject().apply { put("callId", callId) }
        eventEmitter("nativeVoiceWebRtcEnded", data)
    }

    private fun injectUiEvent(name: String, detail: JSONObject) {
        mainHandler.post {
            val bridge = CapacitorVoipCallsPlugin.getInstance()?.bridge ?: return@post
            val webView = bridge.webView ?: return@post
            val js =
                "(function(){try{window.dispatchEvent(new CustomEvent('$name',{detail:${detail}}));}catch(e){}})();"
            webView.evaluateJavascript(js, null)
        }
    }

    private fun injectNativeConnected(callId: String, caller: JSONObject?) {
        val detail = JSONObject().put("callId", callId.lowercase())
        caller?.let { detail.put("caller", it) }
        injectUiEvent("aimediatank-native-call-connected", detail)
    }

    // Parsing helpers

    private fun parseIceServers(array: JSONArray?): List<PeerConnection.IceServer> {
        if (array == null || array.length() == 0) return defaultIceServers()
        val servers = mutableListOf<PeerConnection.IceServer>()
        for (i in 0 until array.length()) {
            val row = array.optJSONObject(i) ?: continue
            val urlsValue = row.opt("urls")
            val urlStrings = mutableListOf<String>()
            when (urlsValue) {
                is String -> urlStrings.add(urlsValue)
                is JSONArray -> for (j in 0 until urlsValue.length()) {
                    urlsValue.optString(j)?.let { if (it.isNotEmpty()) urlStrings.add(it) }
                }
            }
            if (urlStrings.isEmpty()) continue
            val username = row.optString("username", "")
            val credential = row.optString("credential", "")
            val builder = PeerConnection.IceServer.builder(urlStrings)
            if (username.isNotEmpty() && credential.isNotEmpty()) {
                builder.setUsername(username).setPassword(credential)
            }
            servers.add(builder.createIceServer())
        }
        return if (servers.isEmpty()) defaultIceServers() else servers
    }

    private fun normalizeSdp(sdp: String): String {
        // Android WebRTC SDP parser requires CRLF line endings and a trailing newline.
        val trimmed = sdp.trim()
        val crlf = trimmed.replace("\r\n", "\n").replace("\n", "\r\n")
        return if (crlf.endsWith("\r\n")) crlf else "$crlf\r\n"
    }

    private fun extractSdp(value: Any?): String? {
        when (value) {
            null -> return null
            is String -> {
                val trimmed = value.trim()
                if (trimmed.startsWith("v=")) return trimmed
            }
            is JSONObject -> {
                value.optJSONObject("sdp")?.let { nested ->
                    val nestedSdp = nested.optString("sdp", "").trim()
                    if (nestedSdp.startsWith("v=")) return nestedSdp
                }
                val direct = value.optString("sdp", "").trim()
                if (direct.startsWith("v=") && !direct.startsWith("{")) return direct
                if (
                    (value.optString("type", "") == "offer" || value.optString("type", "") == "answer") &&
                    direct.startsWith("v=")
                ) {
                    return direct
                }
            }
        }
        return null
    }

    private fun extractCandidate(value: Any?): JSONObject? {
        val obj = when (value) {
            is JSONObject -> value
            else -> return null
        }
        if (obj.optString("candidate", "").isNotEmpty()) return obj
        obj.optJSONObject("candidate")?.let { nested ->
            if (nested.optString("candidate", "").isNotEmpty()) return nested
        }
        return null
    }

    private fun sdpTypeString(type: SessionDescription.Type): String =
        when (type) {
            SessionDescription.Type.OFFER -> "offer"
            SessionDescription.Type.PRANSWER -> "pranswer"
            SessionDescription.Type.ANSWER -> "answer"
            SessionDescription.Type.ROLLBACK -> "rollback"
        }

    private fun encode(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")

    private abstract class SdpObserverAdapter : SdpObserver {
        override fun onCreateSuccess(desc: SessionDescription?) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(error: String?) {}
        override fun onSetFailure(error: String?) {}
    }
}

private fun defaultIceServers(): List<PeerConnection.IceServer> =
    listOf(
        PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer(),
        PeerConnection.IceServer.builder("stun:stun1.l.google.com:19302").createIceServer(),
    )
