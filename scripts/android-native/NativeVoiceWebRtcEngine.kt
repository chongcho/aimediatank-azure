package com.capacitor.voipcalls

import android.content.Context
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.CookieManager
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
    }

    private fun releaseFactory() {
        mainHandler.post {
            audioDeviceModule?.release()
            audioDeviceModule = null
            peerConnectionFactory?.dispose()
            peerConnectionFactory = null
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

    private var callId: String? = null
    private var token: String? = null
    private var isCaller = false
    private var isAnswering = false
    private var isMediaConnected = false
    private var pollSince = "1970-01-01T00:00:00.000Z"

    private val appliedRemoteIceKeys = mutableSetOf<String>()
    private var icePollGeneration: UUID? = null
    private var bootstrapGeneration: UUID? = null
    private var createAnswerGeneration: UUID? = null
    private var sessionPollGeneration: UUID? = null
    private var cachedCaller: JSONObject? = null
    private var parsedIceServers: List<PeerConnection.IceServer> = defaultIceServers()

    fun isActive(): Boolean = running.get() || peerConnection != null || isAnswering

    fun activeCallId(): String? = callId

    fun isHandlingCall(callIdRaw: String): Boolean {
        val normalized = callIdRaw.lowercase()
        return this.callId == normalized && (isAnswering || running.get() || peerConnection != null)
    }

    fun prepareAnswer(callIdRaw: String, declineToken: String?, remoteOfferSdp: String? = null) {
        val normalized = callIdRaw.lowercase()
        val newToken = declineToken?.trim()?.ifEmpty { null }
        val inlineOffer = remoteOfferSdp?.trim()?.takeIf { it.startsWith("v=") }

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

    fun startCaller(callIdRaw: String, iceServersJson: JSONArray?) {
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
        appliedRemoteIceKeys.clear()
        cachedCaller = null
        parsedIceServers = parseIceServers(iceServersJson)

        Log.i(TAG, "start caller $normalized")
        ensureVoiceCallAudioActive()
        runWebRtc("startCaller") { createAndSendOffer(normalized) }
    }

    fun setMuted(muted: Boolean) {
        localAudioTrack?.setEnabled(!muted)
    }

    fun endCall(syncServer: Boolean = true, reason: String = "user") {
        val id = callId
        val authToken = token
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

        tearDownPeerConnection(notify = true)
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
            .createAudioDeviceModule()
        audioDeviceModule = adm
        val factory = PeerConnectionFactory.builder()
            .setAudioDeviceModule(adm)
            .createPeerConnectionFactory()
        peerConnectionFactory = factory
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

    private fun createAndSendOffer(callId: String) {
        tearDownPeerConnection(notify = false)
        val pc = createPeerConnection(parsedIceServers)
        if (pc == null) {
            failCall(callId, "peer connection create failed")
            return
        }
        peerConnection = pc
        attachLocalAudio(pc)

        val constraints = MediaConstraints()
        pc.createOffer(object : SdpObserverAdapter() {
            override fun onCreateSuccess(desc: SessionDescription?) {
                if (desc == null) {
                    failCall(callId, "createOffer returned nil")
                    return
                }
                pc.setLocalDescription(object : SdpObserverAdapter() {
                    override fun onSetSuccess() {
                        val payload = JSONObject().apply {
                            put("sdp", JSONObject().apply {
                                put("type", sdpTypeString(desc.type))
                                put("sdp", desc.description)
                            })
                        }
                        postSessionSignal(callId, "offer", payload)
                        startSessionPoll(callId, asCaller = true)
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
        pendingRemoteIce: List<JSONObject> = emptyList(),
    ) {
        val sdp = normalizeSdp(offerSdp)
        if (!sdp.startsWith("v=")) {
            failCall(callId, "invalid offer sdp")
            return
        }
        val generation = UUID.randomUUID()
        tearDownPeerConnection(notify = false)
        createAnswerGeneration = generation
        val pc = createPeerConnection(iceServers)
        if (pc == null) {
            failCall(callId, "peer connection create failed")
            return
        }
        peerConnection = pc
        attachLocalAudio(pc)

        val offer = SessionDescription(SessionDescription.Type.OFFER, sdp)
        pc.setRemoteDescription(object : SdpObserverAdapter() {
            override fun onSetSuccess() {
                if (createAnswerGeneration != generation) return
                for (candidate in pendingRemoteIce) {
                    addRemoteIceCandidate(candidate, callId)
                }
                val constraints = MediaConstraints()
                pc.createAnswer(object : SdpObserverAdapter() {
                    override fun onCreateSuccess(desc: SessionDescription?) {
                        if (createAnswerGeneration != generation) return
                        if (desc == null) {
                            failCall(callId, "createAnswer returned nil")
                            return
                        }
                        pc.setLocalDescription(object : SdpObserverAdapter() {
                            override fun onSetSuccess() {
                                if (createAnswerGeneration != generation) return
                                val payload = JSONObject().apply {
                                    put("sdp", JSONObject().apply {
                                        put("type", sdpTypeString(desc.type))
                                        put("sdp", desc.description)
                                    })
                                }
                                Log.i(TAG, "posted answer sdp $callId")
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

            override fun onSetFailure(error: String?) {
                if (createAnswerGeneration != generation) return
                Log.e(TAG, "setRemoteDescription $callId len=${sdp.length} err=$error")
                failCall(callId, "setRemoteDescription: $error")
            }
        }, offer)
    }

    private fun applyRemoteAnswer(callId: String, answerSdp: String) {
        val pc = peerConnection ?: return
        val answer = SessionDescription(SessionDescription.Type.ANSWER, answerSdp)
        pc.setRemoteDescription(object : SdpObserverAdapter() {
            override fun onSetSuccess() {
                Log.i(TAG, "applied remote answer $callId")
            }

            override fun onSetFailure(error: String?) {
                Log.w(TAG, "setRemote answer failed $callId: $error")
            }
        }, answer)
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
            if (peerConnection == null) return
            fetchNativeBootstrap(callId, authToken) { result ->
                if (icePollGeneration != generation) return@fetchNativeBootstrap
                result.onSuccess { bootstrap ->
                    for (candidate in bootstrap.remoteIce) {
                        addRemoteIceCandidate(candidate, callId)
                    }
                }
                mainHandler.postDelayed({ poll() }, 350)
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
            if (peerConnection == null) return
            fetchSessionPoll { result ->
                if (sessionPollGeneration != generation) return@fetchSessionPoll
                result.onSuccess { pollData ->
                    for (signal in pollData.signals) {
                        if (!signal.callId.equals(callId, ignoreCase = true)) continue
                        when (signal.type) {
                            "answer" -> {
                                if (asCaller) {
                                    extractSdp(signal.payload)?.let { applyRemoteAnswer(callId, it) }
                                }
                            }
                            "ice" -> {
                                extractCandidate(signal.payload)?.let { addRemoteIceCandidate(it, callId) }
                            }
                        }
                    }
                    if (pollData.maxCreatedAt.isNotEmpty()) {
                        pollSince = pollData.maxCreatedAt
                    }
                }
                mainHandler.postDelayed({ poll() }, 350)
            }
        }
        poll()
    }

    private fun stopSessionPoll() {
        sessionPollGeneration = null
    }

    private fun addRemoteIceCandidate(dict: JSONObject, callId: String) {
        val pc = peerConnection ?: return
        val key = dict.toString()
        if (!appliedRemoteIceKeys.add(key)) return
        val sdp = dict.optString("candidate", "")
        if (sdp.isEmpty()) return
        val sdpMid = dict.optString("sdpMid", "").ifEmpty { null }
        val mLineIndex = dict.optInt("sdpMLineIndex", 0)
        val candidate = IceCandidate(sdpMid, mLineIndex, sdp)
        pc.addIceCandidate(candidate)
    }

    private fun tearDownPeerConnection(notify: Boolean) {
        createAnswerGeneration = null
        stopIcePoll()
        stopSessionPoll()
        localAudioTrack?.dispose()
        localAudioTrack = null
        audioSource?.dispose()
        audioSource = null
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
        mainHandler.post {
            CapacitorVoipCallsPlugin.getInstance()?.callManager?.setVoiceCallAudioActive(true)
        }
    }

    private fun failCall(callId: String, error: String) {
        Log.e(TAG, "failed $callId: $error")
        token?.let { postNativeTrace(callId, it, "native_webrtc_failed", JSONObject().put("error", error)) }
        isAnswering = false
        bootstrapGeneration = null
        running.set(false)
        tearDownPeerConnection(notify = false)
        emitFailed(callId, error)
        injectUiEvent("aimediatank-callkit-end", JSONObject().put("callId", callId))
        this.callId = null
        token = null
    }

    private fun markConnected(callId: String) {
        if (!isAnswering && peerConnection == null && !isCaller) return
        if (isMediaConnected) return
        isMediaConnected = true
        isAnswering = false
        bootstrapGeneration = null
        running.set(true)
        Log.i(TAG, "connected $callId")
        token?.let { postNativeTrace(callId, it, "native_webrtc_connected") }
        emitConnected(callId, cachedCaller)
        scheduleConnectedUiSync(callId, cachedCaller)
    }

    private fun scheduleConnectedUiSync(callId: String, caller: JSONObject?) {
        val delays = longArrayOf(0, 1000, 2000, 4000, 8000, 15000, 30000, 60000, 120000)
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
    override fun onAddTrack(receiver: RtpReceiver?, streams: Array<out MediaStream>?) {}
    override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>?) {}

    override fun onIceConnectionChange(state: PeerConnection.IceConnectionState?) {
        val id = callId ?: return
        Log.i(TAG, "ice state $id: $state")
        when (state) {
            PeerConnection.IceConnectionState.CONNECTED,
            PeerConnection.IceConnectionState.COMPLETED,
            -> markConnected(id)
            PeerConnection.IceConnectionState.FAILED -> failCall(id, "ICE failed")
            PeerConnection.IceConnectionState.CHECKING ->
                token?.let { postNativeTrace(id, it, "native_webrtc_ice_checking") }
            PeerConnection.IceConnectionState.DISCONNECTED ->
                token?.let { postNativeTrace(id, it, "native_webrtc_ice_disconnected") }
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

    private fun normalizeSdp(sdp: String): String =
        sdp.trim().replace("\r\n", "\n")

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
