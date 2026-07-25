import AVFoundation
import Capacitor
import CoreMedia
import Foundation
import UIKit
import WebRTC

protocol NativeVoiceCallEngineDelegate: AnyObject {
    func nativeVoiceCallEngineDidConnect(callId: String, caller: [String: Any]?)
    func nativeVoiceCallEngineDidFail(callId: String, error: String)
    func nativeVoiceCallEngineDidEnd(callId: String)
}

/// Native WebRTC answer path for CallKit (works on lock screen without WKWebView).
final class NativeVoiceCallEngine: NSObject, RTCPeerConnectionDelegate {
    static let shared = NativeVoiceCallEngine()

    weak var delegate: NativeVoiceCallEngineDelegate?

    private var factory: RTCPeerConnectionFactory?
    private var peerConnection: RTCPeerConnection?
    private var callId: String?
    private var token: String?
    private var baseURL: String = ""
    private var appliedRemoteIceKeys = Set<String>()
    private var pendingRemoteIce = [[String: Any]]()
    private var remoteDescriptionReady = false
    private var isAnswering = false
    private var audioSessionReady = false
    private var pendingStart = false
    private var icePollGeneration: UUID?
    private var bootstrapGeneration: UUID?
    private var createAnswerGeneration: UUID?
    private var remoteIceEpoch = 0
    private var iceDisconnectWorkItem: DispatchWorkItem?
    private var uiSyncGeneration = UUID()
    private var isShuttingDownPeerConnection = false
    private var cachedCaller: [String: Any]?
    private(set) var isMediaConnected = false
    private weak var localAudioTrack: RTCAudioTrack?
    private weak var localVideoTrack: RTCVideoTrack?
    private var videoCapturer: RTCCameraVideoCapturer?
    private var videoSource: RTCVideoSource?
    private var wantsVideo = false
    private var localPreviewView: RTCMTLVideoView?
    private var remoteVideoView: RTCMTLVideoView?
    private weak var videoOverlayContainer: UIView?
    private weak var remoteVideoTrack: RTCVideoTrack?
    /// Bottom inset so WKWebView End/Mute/etc. stay visible under the native video surface.
    private var videoControlSafeArea: CGFloat = 0
    /// Prefetched while CallKit is ringing so Accept skips the bootstrap wait.
    private var prefetchedBootstrap: BootstrapResult?
    private var prefetchedCallId: String?
    private var prefetchGeneration: UUID?

    private override init() {
        super.init()
    }

    /// Defer WebRTC init until answer — avoids crashes during PushKit cold wake.
    private func peerConnectionFactory() -> RTCPeerConnectionFactory {
        if let factory { return factory }
        RTCInitializeSSL()
        // Bare RTCPeerConnectionFactory() has no reliable VP8/H264 software path — audio
        // works but remote/local video stays black (camera indicator on, Metal views empty).
        let encoderFactory = RTCDefaultVideoEncoderFactory()
        let decoderFactory = RTCDefaultVideoDecoderFactory()
        if let vp8 = encoderFactory.supportedCodecs().first(where: {
            $0.name.uppercased() == "VP8"
        }) {
            encoderFactory.preferredCodec = vp8
        }
        let created = RTCPeerConnectionFactory(
            encoderFactory: encoderFactory,
            decoderFactory: decoderFactory
        )
        factory = created
        print("[NativeVoiceCallEngine] peerConnectionFactory ready codecs=\(encoderFactory.supportedCodecs().map(\.name))")
        return created
    }

    var isActive: Bool {
        peerConnection != nil || isAnswering
    }

    var activeCallId: String? {
        callId
    }

    /// True until CallKit `didActivate` — signaling may already be in flight.
    var awaitsCallKitAudioActivation: Bool {
        isAnswering && !audioSessionReady
    }

    /// True when native Metal video surface should be shown (tracks/PC active).
    var shouldShowVideoOverlay: Bool {
        wantsVideo && (peerConnection != nil || isMediaConnected)
    }

    /// Fetch offer/ICE while the phone is still ringing (no peer connection / no mic yet).
    func prefetchBootstrapWhileRinging(callId: String, token: String, baseURL: String) {
        let normalized = callId.lowercased()
        guard !token.isEmpty else { return }
        if isAnswering, self.callId == normalized { return }

        self.baseURL = baseURL
        self.token = token
        prefetchedCallId = normalized
        prefetchedBootstrap = nil
        let generation = UUID()
        prefetchGeneration = generation
        // Warm WebRTC early so Accept does not pay RTCInitializeSSL cost.
        _ = peerConnectionFactory()
        print("[NativeVoiceCallEngine] prefetch bootstrap while ringing \(normalized)")
        postTrace(callId: normalized, token: token, event: "native_webrtc_prefetch_start")
        prefetchBootstrapLoop(callId: normalized, token: token, generation: generation, attempt: 0)
    }

    func clearPrefetch(callId: String? = nil) {
        if let callId {
            guard prefetchedCallId == callId.lowercased() else { return }
        }
        prefetchGeneration = nil
        prefetchedBootstrap = nil
        prefetchedCallId = nil
    }

    private func prefetchBootstrapLoop(callId: String, token: String, generation: UUID, attempt: Int) {
        guard prefetchGeneration == generation, prefetchedCallId == callId else { return }
        fetchBootstrap(callId: callId, token: token) { [weak self] result in
            guard let self, self.prefetchGeneration == generation, self.prefetchedCallId == callId else { return }
            switch result {
            case .failure:
                if attempt < 40 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        self.prefetchBootstrapLoop(callId: callId, token: token, generation: generation, attempt: attempt + 1)
                    }
                }
            case .success(let bootstrap):
                if let offer = bootstrap.offerSdp, !offer.isEmpty {
                    self.prefetchedBootstrap = bootstrap
                    if let caller = bootstrap.caller { self.cachedCaller = caller }
                    print("[NativeVoiceCallEngine] prefetch offer ready \(callId) ice=\(bootstrap.remoteIceCandidates.count)")
                    self.postTrace(callId: callId, token: token, event: "native_webrtc_prefetch_ready")
                    return
                }
                if attempt < 40 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        self.prefetchBootstrapLoop(callId: callId, token: token, generation: generation, attempt: attempt + 1)
                    }
                }
            }
        }
    }

    func prepareAnswer(callId: String, token: String, baseURL: String, wantsVideo: Bool = false) {
        let normalized = callId.lowercased()
        if isAnswering, self.callId == normalized {
            // Already answering this call — keep in-flight SDP/ICE; only re-kick if still pending.
            self.token = token
            self.baseURL = baseURL
            if wantsVideo { self.wantsVideo = true }
            beginAnswerIfNeeded()
            return
        }
        if isActive, self.callId != normalized {
            tearDownPeerConnection(notify: false)
        }

        cancelIceDisconnectTimer()
        self.callId = normalized
        self.token = token
        self.baseURL = baseURL
        self.wantsVideo = wantsVideo
        isAnswering = true
        pendingStart = true
        appliedRemoteIceKeys.removeAll()
        pendingRemoteIce.removeAll()
        remoteDescriptionReady = false
        if prefetchedCallId != normalized {
            cachedCaller = nil
            prefetchedBootstrap = nil
        }
        isMediaConnected = false

        print("[NativeVoiceCallEngine] prepare answer \(normalized) prefetch=\(prefetchedBootstrap?.offerSdp != nil) audioReady=\(audioSessionReady) video=\(wantsVideo)")
        postTrace(callId: normalized, token: token, event: "native_webrtc_prepare")

        // Start SDP/ICE immediately on Accept — do not wait for CallKit didActivate.
        beginAnswerIfNeeded()
    }

    func audioSessionActivated() {
        audioSessionReady = true
        applyWebRtcAudioSession(activated: true)
        localAudioTrack?.isEnabled = true
        // If Accept raced ahead of didActivate, finish any deferred start (should be rare now).
        beginAnswerIfNeeded()
    }

    private func ensureWebRtcAudioEnabled() {
        guard audioSessionReady else { return }
        applyWebRtcAudioSession(activated: false)
    }

    /// Keep WebRTC VoiceProcessing IO able to play remote audio (mic alone is not enough).
    private func applyWebRtcAudioSession(activated: Bool) {
        let rtc = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        defer { rtc.unlockForConfiguration() }

        let config = RTCAudioSessionConfiguration.webRTC()
        config.category = AVAudioSession.Category.playAndRecord.rawValue
        config.mode = AVAudioSession.Mode.voiceChat.rawValue
        config.categoryOptions = [
            .allowBluetoothHFP,
            .allowBluetoothA2DP,
            .defaultToSpeaker,
        ]
        do {
            // CallKit already activated the session — do not setActive here.
            try rtc.setConfiguration(config)
        } catch {
            print("[NativeVoiceCallEngine] RTCAudioSession setConfiguration failed: \(error.localizedDescription)")
        }
        if activated {
            rtc.audioSessionDidActivate(AVAudioSession.sharedInstance())
        }
        rtc.isAudioEnabled = true
        forceLoudspeakerOutput()
    }

    private func forceLoudspeakerOutput() {
        do {
            try AVAudioSession.sharedInstance().overrideOutputAudioPort(.speaker)
        } catch {
            print("[NativeVoiceCallEngine] speaker override failed: \(error.localizedDescription)")
        }
    }

    func audioSessionDeactivated() {
        let rtc = RTCAudioSession.sharedInstance()
        rtc.lockForConfiguration()
        defer { rtc.unlockForConfiguration() }
        rtc.audioSessionDidDeactivate(AVAudioSession.sharedInstance())
        rtc.isAudioEnabled = false
        audioSessionReady = false
    }

    func endCall(reason: String = "user", syncServer: Bool = true) {
        print("[NativeVoiceCallEngine] end call \(callId ?? "nil") reason=\(reason)")
        cancelIceDisconnectTimer()
        uiSyncGeneration = UUID()
        stopIcePoll()
        bootstrapGeneration = nil
        clearPrefetch()
        isAnswering = false
        pendingStart = false
        isMediaConnected = false
        wantsVideo = false

        let endedCallId = callId
        let authToken = token

        if syncServer, let endedCallId, let authToken {
            postNativeCallKit(action: "end", callId: endedCallId, token: authToken)
        }

        self.callId = nil
        self.token = nil
        cachedCaller = nil
        localAudioTrack = nil
        stopVideoCapture()
        removeVideoOverlay()
        tearDownPeerConnection(notify: true, notifyCallId: endedCallId)
    }

    func syncUiIfConnected() {
        guard isMediaConnected, let callId else { return }
        scheduleConnectedUiSync(callId: callId, caller: cachedCaller)
    }

    private func beginAnswerIfNeeded() {
        guard pendingStart, isAnswering else { return }
        guard let callId, let token, !token.isEmpty else { return }
        pendingStart = false

        postNativeCallKit(action: "accept", callId: callId, token: token)
        print("[NativeVoiceCallEngine] begin answer \(callId) audioReady=\(audioSessionReady)")

        if prefetchedCallId == callId.lowercased(),
           let cached = prefetchedBootstrap,
           let offerSdp = cached.offerSdp,
           !offerSdp.isEmpty
        {
            let ice = cached.remoteIceCandidates
            let servers = cached.iceServers
            if let caller = cached.caller { cachedCaller = caller }
            prefetchedBootstrap = nil
            prefetchGeneration = nil
            print("[NativeVoiceCallEngine] using prefetched offer \(callId)")
            postTrace(callId: callId, token: token, event: "native_webrtc_prefetch_hit")
            createAnswer(
                callId: callId,
                token: token,
                offerSdp: offerSdp,
                iceServers: servers,
                initialRemoteIce: ice
            )
            return
        }

        bootstrapUntilOfferReady(callId: callId, token: token)
    }

    private func bootstrapUntilOfferReady(callId: String, token: String, attempt: Int = 0) {
        let generation = UUID()
        bootstrapGeneration = generation

        fetchBootstrap(callId: callId, token: token) { [weak self] result in
            guard let self, self.bootstrapGeneration == generation else { return }
            guard self.isAnswering, self.callId == callId.lowercased() else { return }

            switch result {
            case .failure(let error):
                if attempt < 60 {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                        self.bootstrapUntilOfferReady(callId: callId, token: token, attempt: attempt + 1)
                    }
                } else {
                    self.failCall(callId: callId, error: error.localizedDescription)
                }
            case .success(let bootstrap):
                if let caller = bootstrap.caller {
                    self.cachedCaller = caller
                }
                guard let offerSdp = bootstrap.offerSdp, !offerSdp.isEmpty else {
                    if attempt < 60 {
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                            self.bootstrapUntilOfferReady(callId: callId, token: token, attempt: attempt + 1)
                        }
                    } else {
                        self.failCall(callId: callId, error: "offer missing")
                    }
                    return
                }
                DispatchQueue.main.async {
                    self.createAnswer(
                        callId: callId,
                        token: token,
                        offerSdp: offerSdp,
                        iceServers: bootstrap.iceServers,
                        initialRemoteIce: bootstrap.remoteIceCandidates
                    )
                }
            }
        }
    }

    private func createAnswer(
        callId: String,
        token: String,
        offerSdp: String,
        iceServers: [RTCIceServer],
        initialRemoteIce: [[String: Any]] = []
    ) {
        guard let sdp = Self.normalizeSdp(offerSdp), sdp.hasPrefix("v="), !sdp.hasPrefix("{") else {
            failCall(callId: callId, error: "invalid offer sdp")
            return
        }

        // Prefer offer SDP over push flag — push video= can be missing while offer has m=video.
        let offerHasVideo = sdp.contains("m=video")
        if offerHasVideo {
            wantsVideo = true
        }

        let generation = UUID()
        tearDownPeerConnection(notify: false)
        createAnswerGeneration = generation
        // Enable WebRTC audio I/O only after CallKit didActivate; signaling starts now.
        if audioSessionReady {
            ensureWebRtcAudioEnabled()
        }

        let config = RTCConfiguration()
        config.iceServers = iceServers
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually

        let pcConstraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
        )

        guard let pc = peerConnectionFactory().peerConnection(with: config, constraints: pcConstraints, delegate: self) else {
            failCall(callId: callId, error: "peer connection create failed")
            return
        }
        peerConnection = pc

        let audioSource = peerConnectionFactory().audioSource(with: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil))
        let audioTrack = peerConnectionFactory().audioTrack(with: audioSource, trackId: "audio0")
        // Keep mic muted until CallKit activates the shared audio session.
        audioTrack.isEnabled = audioSessionReady
        localAudioTrack = audioTrack
        pc.add(audioTrack, streamIds: ["stream0"])

        // Match Android: attach local video before setRemoteDescription so the answer
        // negotiates sendrecv with a real track (Unified Plan reuses/adds correctly).
        if wantsVideo {
            attachLocalVideoTrack(to: pc, startCapture: false)
        }

        let offer = RTCSessionDescription(type: .offer, sdp: sdp)
        print("[NativeVoiceCallEngine] setRemoteDescription \(callId) len=\(sdp.count) video=\(wantsVideo)")
        pc.setRemoteDescription(offer) { [weak self] error in
            guard let self else { return }
            guard self.createAnswerGeneration == generation else { return }
            if let error {
                self.failCall(callId: callId, error: "setRemoteDescription: \(error.localizedDescription)")
                return
            }
            self.remoteDescriptionReady = true
            for candidate in initialRemoteIce {
                self.addRemoteIceCandidate(candidate, callId: callId)
            }
            self.flushPendingRemoteIce(callId: callId)

            if self.wantsVideo {
                // Ensure sendrecv on the offer's video transceiver after remote description.
                if let transceiver = pc.transceivers.first(where: { $0.mediaType == .video }) {
                    transceiver.setDirection(.sendRecv, error: nil)
                }
            }

            let answerConstraints = RTCMediaConstraints(
                mandatoryConstraints: [
                    "OfferToReceiveAudio": "true",
                    "OfferToReceiveVideo": self.wantsVideo ? "true" : "false",
                ],
                optionalConstraints: nil
            )
            pc.answer(for: answerConstraints) { answer, error in
                guard self.createAnswerGeneration == generation else { return }
                if let error {
                    self.failCall(callId: callId, error: "createAnswer: \(error.localizedDescription)")
                    return
                }
                guard let answer else {
                    self.failCall(callId: callId, error: "createAnswer returned nil")
                    return
                }
                pc.setLocalDescription(answer) { error in
                    guard self.createAnswerGeneration == generation else { return }
                    if let error {
                        self.failCall(callId: callId, error: "setLocalDescription: \(error.localizedDescription)")
                        return
                    }
                    self.postSignal(
                        callId: callId,
                        token: token,
                        type: "answer",
                        payload: ["sdp": ["type": Self.sdpTypeString(answer.type), "sdp": answer.sdp]]
                    )
                    self.postTrace(callId: callId, token: token, event: "native_webrtc_answer_sent")
                    print("[NativeVoiceCallEngine] posted answer sdp \(callId) hasVideoMLine=\(answer.sdp.contains("m=video"))")
                    if self.wantsVideo {
                        self.startLocalCameraIfNeeded()
                        self.ensureVideoOverlay()
                    }
                    self.startIcePoll(callId: callId, token: token)
                }
            }
        }
    }

    private func tearDownPeerConnection(notify: Bool, notifyCallId: String? = nil) {
        let callIdForNotify = notify ? notifyCallId : nil
        runOnMain { [weak self] in
            guard let self else { return }
            self.isShuttingDownPeerConnection = true
            self.createAnswerGeneration = nil
            self.stopIcePoll()
            self.remoteDescriptionReady = false
            self.pendingRemoteIce.removeAll()
            self.invalidateRemoteIceProcessing()
            self.localAudioTrack = nil
            self.stopVideoCapture()
            self.removeVideoOverlay()
            let pc = self.peerConnection
            self.peerConnection = nil
            pc?.close()
            self.isShuttingDownPeerConnection = false
            if let callIdForNotify {
                self.delegate?.nativeVoiceCallEngineDidEnd(callId: callIdForNotify)
                self.injectUiEvent(name: "aimediatank-callkit-end", callId: callIdForNotify)
            }
        }
    }

    private func failCall(callId: String, error: String) {
        print("[NativeVoiceCallEngine] failed \(callId): \(error)")
        let authToken = token
        uiSyncGeneration = UUID()
        postTrace(callId: callId, token: authToken ?? "", event: "native_webrtc_failed", detail: ["error": error])
        cancelIceDisconnectTimer()
        isAnswering = false
        pendingStart = false
        bootstrapGeneration = nil
        isMediaConnected = false
        self.callId = nil
        self.token = nil
        tearDownPeerConnection(notify: false)
        runOnMain { [weak self] in
            self?.delegate?.nativeVoiceCallEngineDidFail(callId: callId, error: error)
            self?.injectUiEvent(name: "aimediatank-callkit-end", callId: callId)
        }
        if let authToken, !authToken.isEmpty {
            postNativeCallKit(action: "end", callId: callId, token: authToken)
        }
    }

    private func markConnected(callId: String) {
        guard isAnswering || peerConnection != nil else { return }
        guard !isMediaConnected else { return }
        cancelIceDisconnectTimer()
        invalidateRemoteIceProcessing()
        isMediaConnected = true
        isAnswering = false
        pendingStart = false
        bootstrapGeneration = nil
        stopIcePoll()
        ensureWebRtcAudioEnabled()
        print("[NativeVoiceCallEngine] connected \(callId)")
        ensureWebRtcAudioEnabled()
        postTrace(callId: callId, token: token ?? "", event: "native_webrtc_connected")
        if wantsVideo {
            layoutVideoOverlayForJsControls()
        }
        let caller = cachedCaller
        runOnMain { [weak self] in
            guard let self, self.isMediaConnected, self.callId == callId.lowercased() else { return }
            self.delegate?.nativeVoiceCallEngineDidConnect(callId: callId, caller: caller)
            self.scheduleConnectedUiSync(callId: callId, caller: caller)
        }
    }

    private func scheduleConnectedUiSync(callId: String, caller: [String: Any]?) {
        let normalized = callId.lowercased()
        let generation = uiSyncGeneration
        let delays: [TimeInterval] = [0, 0.4, 1.5]
        for delay in delays {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, generation == self.uiSyncGeneration else { return }
                guard self.isMediaConnected, self.callId == normalized else { return }
                self.injectNativeConnected(callId: normalized, caller: caller)
            }
        }
    }

    private func startIcePoll(callId: String, token: String) {
        stopIcePoll()
        let generation = UUID()
        icePollGeneration = generation

        func poll() {
            guard self.icePollGeneration == generation else { return }
            guard self.peerConnection != nil, !self.isMediaConnected else { return }
            self.fetchBootstrap(callId: callId, token: token) { result in
                guard self.icePollGeneration == generation else { return }
                guard !self.isMediaConnected else { return }
                if case .success(let bootstrap) = result {
                    DispatchQueue.main.async {
                        guard self.icePollGeneration == generation, !self.isMediaConnected else { return }
                        for candidate in bootstrap.remoteIceCandidates {
                            self.addRemoteIceCandidate(candidate, callId: callId)
                        }
                    }
                }
                guard self.icePollGeneration == generation, !self.isMediaConnected else { return }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    poll()
                }
            }
        }
        poll()
    }

    private func stopIcePoll() {
        icePollGeneration = nil
    }

    private func invalidateRemoteIceProcessing() {
        remoteIceEpoch &+= 1
        pendingRemoteIce.removeAll()
    }

    private func flushPendingRemoteIce(callId: String) {
        guard !pendingRemoteIce.isEmpty, shouldProcessRemoteIce() else { return }
        let queued = pendingRemoteIce
        pendingRemoteIce.removeAll()
        for candidate in queued {
            addRemoteIceCandidate(candidate, callId: callId)
        }
    }

    private func shouldProcessRemoteIce() -> Bool {
        if isMediaConnected { return false }
        guard let pc = peerConnection else { return false }
        return canAcceptRemoteIce(pc)
    }

    private func canAcceptRemoteIce(_ pc: RTCPeerConnection) -> Bool {
        switch pc.iceConnectionState {
        case .connected, .completed, .closed, .failed:
            return false
        default:
            return true
        }
    }

    private func addRemoteIceCandidate(_ dict: [String: Any], callId: String) {
        let epoch = remoteIceEpoch
        let key = candidateKey(dict)
        if appliedRemoteIceKeys.contains(key) { return }
        if !remoteDescriptionReady {
            pendingRemoteIce.append(dict)
            return
        }
        if !shouldProcessRemoteIce() { return }

        let task = { [weak self] in
            guard let self else { return }
            guard epoch == self.remoteIceEpoch else { return }
            guard self.callId == callId.lowercased() else { return }
            if !self.shouldProcessRemoteIce() { return }
            guard let pc = self.peerConnection else { return }
            if pc.remoteDescription == nil {
                self.pendingRemoteIce.append(dict)
                return
            }
            if !self.canAcceptRemoteIce(pc) { return }
            guard !self.appliedRemoteIceKeys.contains(key) else { return }
            guard let sdp = dict["candidate"] as? String, !sdp.isEmpty else { return }
            self.appliedRemoteIceKeys.insert(key)
            let mLineIndex = Int32(dict["sdpMLineIndex"] as? Int ?? 0)
            let rawMid = dict["sdpMid"] as? String
            let sdpMid = (rawMid?.isEmpty == false) ? rawMid : nil
            pc.add(RTCIceCandidate(sdp: sdp, sdpMLineIndex: mLineIndex, sdpMid: sdpMid)) { error in
                if let error {
                    self.appliedRemoteIceKeys.remove(key)
                    print("[NativeVoiceCallEngine] add ICE failed \(callId): \(error.localizedDescription)")
                }
            }
        }

        if Thread.isMainThread {
            task()
        } else {
            DispatchQueue.main.async(execute: task)
        }
    }

    private func candidateKey(_ dict: [String: Any]) -> String {
        let sdp = dict["candidate"] as? String ?? ""
        let mid = dict["sdpMid"] as? String ?? ""
        let idx = dict["sdpMLineIndex"] as? Int ?? -1
        return "\(idx)|\(mid)|\(sdp)"
    }

    private func cancelIceDisconnectTimer() {
        iceDisconnectWorkItem?.cancel()
        iceDisconnectWorkItem = nil
    }

    private func scheduleIceDisconnectFail(callId: String) {
        cancelIceDisconnectTimer()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            self.iceDisconnectWorkItem = nil
            guard self.callId == callId.lowercased() else { return }
            if !self.isMediaConnected, self.peerConnection == nil { return }
            self.failCall(callId: callId, error: "ICE disconnected")
        }
        iceDisconnectWorkItem = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 8, execute: work)
    }

    private func attachLocalVideoTrack(to pc: RTCPeerConnection, startCapture: Bool = true) {
        let source = peerConnectionFactory().videoSource()
        videoSource = source
        let capturer = RTCCameraVideoCapturer(delegate: source)
        videoCapturer = capturer
        let track = peerConnectionFactory().videoTrack(with: source, trackId: "video0")
        track.isEnabled = true
        localVideoTrack = track

        // Prefer the video transceiver created by the remote offer (Unified Plan).
        // WebRTC-SDK does not expose RTCRtpSender.setTrack — addTrack after
        // setRemoteDescription reuses the offer's video transceiver.
        if let transceiver = pc.transceivers.first(where: { $0.mediaType == .video }) {
            transceiver.setDirection(.sendRecv, error: nil)
        }
        pc.add(track, streamIds: ["stream0"])
        print("[NativeVoiceCallEngine] local video track added (transceivers=\(pc.transceivers.count))")

        if startCapture {
            startFrontCamera(capturer: capturer)
        }
        bindLocalPreviewIfNeeded()
        print("[NativeVoiceCallEngine] local video track attached capture=\(startCapture)")
    }

    private func bindLocalPreviewIfNeeded() {
        guard let track = localVideoTrack, let preview = localPreviewView else { return }
        track.add(preview)
    }

    private func bindRemoteVideoIfNeeded() {
        guard let track = remoteVideoTrack, let remote = remoteVideoView else { return }
        track.isEnabled = true
        track.add(remote)
    }

    private func startLocalCameraIfNeeded() {
        guard wantsVideo, let capturer = videoCapturer else { return }
        startFrontCamera(capturer: capturer)
        bindLocalPreviewIfNeeded()
    }

    private func startFrontCamera(capturer: RTCCameraVideoCapturer) {
        let devices = RTCCameraVideoCapturer.captureDevices()
        let device =
            devices.first(where: { $0.position == .front })
            ?? devices.first
        guard let device else {
            print("[NativeVoiceCallEngine] no camera device")
            return
        }
        let auth = AVCaptureDevice.authorizationStatus(for: .video)
        let start = { [weak self] in
            guard let self else { return }
            let formats = RTCCameraVideoCapturer.supportedFormats(for: device)
            let format =
                formats.first(where: {
                    let dims = CMVideoFormatDescriptionGetDimensions($0.formatDescription)
                    return dims.width >= 640 && dims.width <= 1280
                })
                ?? formats.dropLast().last
                ?? formats.first
            guard let format else { return }
            let fps = Int(format.videoSupportedFrameRateRanges.first?.maxFrameRate ?? 30)
            capturer.startCapture(with: device, format: format, fps: min(fps, 30))
            print("[NativeVoiceCallEngine] camera start requested")
            self.bindLocalPreviewIfNeeded()
        }
        if auth == .authorized {
            start()
            return
        }
        if auth == .notDetermined {
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    if granted {
                        start()
                    } else {
                        print("[NativeVoiceCallEngine] camera permission denied")
                    }
                }
            }
            return
        }
        print("[NativeVoiceCallEngine] camera permission \(auth.rawValue)")
    }

    private func stopVideoCapture() {
        videoCapturer?.stopCapture()
        videoCapturer = nil
        localVideoTrack = nil
        remoteVideoTrack = nil
        videoSource = nil
    }

    /// Call UI painted in WKWebView — keep native video (JS has no MediaStream on CallKit Accept).
    /// Inset the bottom so End / Mute / Speaker remain visible and tappable through the overlay.
    func layoutVideoOverlayForJsControls() {
        guard wantsVideo else { return }
        videoControlSafeArea = 132
        ensureVideoOverlay()
        applyVideoOverlayLayout()
    }

    /// Legacy name — never strip the native surface while video media is live.
    func hideVideoOverlayForJsUi() {
        layoutVideoOverlayForJsControls()
    }

    private func ensureVideoOverlay() {
        let work = { [weak self] in
            guard let self, self.wantsVideo else { return }
            if self.videoOverlayContainer == nil {
                guard let host = Self.findBridgeViewController()?.view
                    ?? UIApplication.shared.connectedScenes
                    .compactMap({ $0 as? UIWindowScene })
                    .flatMap(\.windows)
                    .first(where: { $0.isKeyWindow })
                else { return }

                let container = UIView(frame: host.bounds)
                container.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                // Must stay clear — opaque Metal placeholders covered the working voice UI.
                container.backgroundColor = .clear
                container.isUserInteractionEnabled = false
                container.tag = 0xA11C08

                let remote = RTCMTLVideoView(frame: .zero)
                remote.videoContentMode = .scaleAspectFill
                // Opaque Metal layer — clear/isOpaque=false often never paints frames.
                remote.backgroundColor = UIColor(white: 0.05, alpha: 1)
                remote.isOpaque = true
                container.addSubview(remote)

                let preview = RTCMTLVideoView(frame: .zero)
                preview.videoContentMode = .scaleAspectFill
                preview.backgroundColor = UIColor(white: 0.12, alpha: 1)
                preview.isOpaque = true
                preview.layer.cornerRadius = 10
                preview.clipsToBounds = true
                // Do not apply CATransform3D/UIView mirror — breaks RTCMTLVideoView rendering.
                container.addSubview(preview)

                host.addSubview(container)
                self.videoOverlayContainer = container
                self.remoteVideoView = remote
                self.localPreviewView = preview
                print("[NativeVoiceCallEngine] video overlay attached on \(type(of: host))")
            }
            self.applyVideoOverlayLayout()
            self.bindLocalPreviewIfNeeded()
            self.bindRemoteVideoIfNeeded()
        }
        if Thread.isMainThread {
            work()
        } else {
            DispatchQueue.main.async(execute: work)
        }
    }

    private func applyVideoOverlayLayout() {
        guard let container = videoOverlayContainer else { return }
        if let host = container.superview {
            container.frame = host.bounds
        }
        let bounds = container.bounds
        let bottom = max(0, videoControlSafeArea)
        let videoHeight = max(1, bounds.height - bottom)
        remoteVideoView?.frame = CGRect(x: 0, y: 0, width: bounds.width, height: videoHeight)
        let previewW: CGFloat = 100
        let previewH: CGFloat = 140
        let previewX = max(0, bounds.width - previewW - 16)
        let previewY: CGFloat = 56
        localPreviewView?.frame = CGRect(x: previewX, y: previewY, width: previewW, height: previewH)
        container.superview?.bringSubviewToFront(container)
    }

    private func removeVideoOverlay() {
        runOnMain { [weak self] in
            guard let self else { return }
            self.localPreviewView?.removeFromSuperview()
            self.remoteVideoView?.removeFromSuperview()
            self.videoOverlayContainer?.removeFromSuperview()
            self.localPreviewView = nil
            self.remoteVideoView = nil
            self.videoOverlayContainer = nil
            self.videoControlSafeArea = 0
        }
    }

    // MARK: - RTCPeerConnectionDelegate

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        for track in stream.audioTracks {
            track.isEnabled = true
            print("[NativeVoiceCallEngine] remote stream audio track enabled")
        }
        for track in stream.videoTracks {
            track.isEnabled = true
            self.remoteVideoTrack = track
            print("[NativeVoiceCallEngine] remote stream video track")
            DispatchQueue.main.async {
                self.ensureVideoOverlay()
                self.bindRemoteVideoIfNeeded()
            }
        }
        ensureWebRtcAudioEnabled()
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    func peerConnection(
        _ peerConnection: RTCPeerConnection,
        didAdd rtpReceiver: RTCRtpReceiver,
        streams mediaStreams: [RTCMediaStream]
    ) {
        if let track = rtpReceiver.track as? RTCAudioTrack {
            track.isEnabled = true
            print("[NativeVoiceCallEngine] remote RTP audio track enabled")
            ensureWebRtcAudioEnabled()
        }
        if let track = rtpReceiver.track as? RTCVideoTrack {
            track.isEnabled = true
            remoteVideoTrack = track
            print("[NativeVoiceCallEngine] remote RTP video track")
            DispatchQueue.main.async {
                self.ensureVideoOverlay()
                self.bindRemoteVideoIfNeeded()
            }
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didStartReceivingOn transceiver: RTCRtpTransceiver) {
        guard transceiver.mediaType == .video,
              let track = transceiver.receiver.track as? RTCVideoTrack
        else { return }
        track.isEnabled = true
        remoteVideoTrack = track
        print("[NativeVoiceCallEngine] didStartReceivingOn video")
        DispatchQueue.main.async {
            self.ensureVideoOverlay()
            self.bindRemoteVideoIfNeeded()
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        guard let callId, !isShuttingDownPeerConnection else { return }
        print("[NativeVoiceCallEngine] ice state \(callId): \(newState.rawValue)")
        switch newState {
        case .connected, .completed:
            cancelIceDisconnectTimer()
            markConnected(callId: callId)
        case .failed:
            failCall(callId: callId, error: "ICE failed")
        case .checking:
            postTrace(callId: callId, token: token ?? "", event: "native_webrtc_ice_checking")
        case .disconnected:
            postTrace(callId: callId, token: token ?? "", event: "native_webrtc_ice_disconnected")
            scheduleIceDisconnectFail(callId: callId)
        default:
            break
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        guard let callId, let token else { return }
        var candidatePayload: [String: Any] = [
            "candidate": candidate.sdp,
            "sdpMLineIndex": candidate.sdpMLineIndex,
        ]
        if let sdpMid = candidate.sdpMid, !sdpMid.isEmpty {
            candidatePayload["sdpMid"] = sdpMid
        }
        postSignal(
            callId: callId,
            token: token,
            type: "ice",
            payload: ["candidate": candidatePayload]
        )
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    // MARK: - HTTP

    private struct BootstrapResult {
        let offerSdp: String?
        let iceServers: [RTCIceServer]
        let remoteIceCandidates: [[String: Any]]
        let caller: [String: Any]?
    }

    private struct BootstrapError: LocalizedError {
        let message: String
        var errorDescription: String? { message }
    }

    private func fetchBootstrap(
        callId: String,
        token: String,
        completion: @escaping (Result<BootstrapResult, BootstrapError>) -> Void
    ) {
        var components = URLComponents(string: "\(baseURL)/api/chat/voice/native-callkit")!
        components.queryItems = [
            URLQueryItem(name: "callId", value: callId.lowercased()),
            URLQueryItem(name: "token", value: token),
        ]
        guard let url = components.url else {
            completion(.failure(BootstrapError(message: "invalid bootstrap url")))
            return
        }
        URLSession.shared.dataTask(with: url) { data, response, error in
            if let error {
                completion(.failure(BootstrapError(message: error.localizedDescription)))
                return
            }
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            guard code == 200, let data else {
                completion(.failure(BootstrapError(message: "bootstrap HTTP \(code)")))
                return
            }
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                completion(.failure(BootstrapError(message: "bootstrap parse failed")))
                return
            }

            let offerSdp = Self.extractSdp(from: json["offer"])
            let iceServers = Self.parseIceServers(json["iceServers"])
            var remoteIce: [[String: Any]] = []
            if let rows = json["iceCandidates"] as? [Any] {
                for row in rows {
                    guard let obj = row as? [String: Any] else { continue }
                    if let candidate = Self.extractCandidateDict(from: obj["candidate"]) {
                        remoteIce.append(candidate)
                    }
                }
            }
            completion(.success(BootstrapResult(
                offerSdp: offerSdp,
                iceServers: iceServers,
                remoteIceCandidates: remoteIce,
                caller: json["caller"] as? [String: Any]
            )))
        }.resume()
    }

    private func postNativeCallKit(action: String, callId: String, token: String, extra: [String: Any] = [:]) {
        guard let url = URL(string: "\(baseURL)/api/chat/voice/native-callkit") else { return }
        var body: [String: Any] = ["action": action, "callId": callId.lowercased(), "token": token]
        for (key, value) in extra { body[key] = value }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: request).resume()
    }

    private func postSignal(callId: String, token: String, type: String, payload: [String: Any]) {
        postNativeCallKit(action: "signal", callId: callId, token: token, extra: [
            "type": type,
            "payload": payload,
        ])
    }

    private func postTrace(callId: String, token: String, event: String, detail: [String: Any] = [:]) {
        guard !token.isEmpty, let url = URL(string: "\(baseURL)/api/chat/voice/native-trace") else { return }
        var body: [String: Any] = [
            "callId": callId.lowercased(),
            "token": token,
            "source": "ios_native_webrtc",
            "event": event,
        ]
        if !detail.isEmpty { body["detail"] = detail }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: request).resume()
    }

    private static func sdpTypeString(_ type: RTCSdpType) -> String {
        switch type {
        case .offer: return "offer"
        case .prAnswer: return "pranswer"
        case .answer: return "answer"
        case .rollback: return "rollback"
        @unknown default: return "answer"
        }
    }

    private static func normalizeSdp(_ sdp: String) -> String? {
        let trimmed = sdp.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.hasPrefix("v=") else { return nil }
        var crlf = trimmed.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\n", with: "\r\n")
        if !crlf.hasSuffix("\r\n") {
            crlf += "\r\n"
        }
        return crlf
    }

    private static func extractSdp(from value: Any?) -> String? {
        guard let value else { return nil }
        if let str = value as? String {
            let trimmed = str.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.hasPrefix("v=") { return trimmed }
        }
        guard let obj = value as? [String: Any] else { return nil }
        if let nested = obj["sdp"] as? [String: Any],
           let nestedSdp = nested["sdp"] as? String {
            let trimmed = nestedSdp.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.hasPrefix("v=") { return trimmed }
        }
        if let direct = obj["sdp"] as? String {
            let trimmed = direct.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.hasPrefix("v="), !trimmed.hasPrefix("{") { return trimmed }
        }
        let type = obj["type"] as? String ?? ""
        if (type == "offer" || type == "answer"), let direct = obj["sdp"] as? String {
            let trimmed = direct.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmed.hasPrefix("v=") { return trimmed }
        }
        return nil
    }

    private static func extractCandidateDict(from value: Any?) -> [String: Any]? {
        guard let dict = value as? [String: Any] else { return nil }
        if dict["candidate"] is String { return dict }
        if let nested = dict["candidate"] as? [String: Any], nested["candidate"] is String { return nested }
        return nil
    }

    private static func parseIceServers(_ value: Any?) -> [RTCIceServer] {
        guard let rows = value as? [[String: Any]] else {
            return [RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"])]
        }
        var servers: [RTCIceServer] = []
        for row in rows {
            let urlsValue = row["urls"]
            var urlStrings: [String] = []
            if let str = urlsValue as? String { urlStrings = [str] }
            else if let arr = urlsValue as? [String] { urlStrings = arr }
            guard !urlStrings.isEmpty else { continue }
            let username = row["username"] as? String
            let credential = row["credential"] as? String
            if let username, let credential, !username.isEmpty {
                servers.append(RTCIceServer(urlStrings: urlStrings, username: username, credential: credential))
            } else {
                servers.append(RTCIceServer(urlStrings: urlStrings))
            }
        }
        if servers.isEmpty {
            servers.append(RTCIceServer(urlStrings: ["stun:stun.l.google.com:19302"]))
        }
        return servers
    }

    private func runOnMain(_ block: @escaping () -> Void) {
        if Thread.isMainThread {
            block()
        } else {
            DispatchQueue.main.async(execute: block)
        }
    }

    private func injectUiEvent(name: String, callId: String, extra: [String: Any] = [:]) {
        runOnMain { [weak self] in
            guard let self else { return }
            guard UIApplication.shared.isProtectedDataAvailable else { return }
            guard let bridge = Self.findBridgeViewController(), let webView = bridge.webView else { return }
            var detail: [String: Any] = ["callId": callId.lowercased()]
            for (key, value) in extra { detail[key] = value }
            guard let detailData = try? JSONSerialization.data(withJSONObject: detail),
                  let detailJson = String(data: detailData, encoding: .utf8) else { return }
            let js = """
            (function(){ try { window.dispatchEvent(new CustomEvent('\\(name)', { detail: \\(detailJson) })); } catch (e) {} })();
            """
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    private func injectNativeConnected(callId: String, caller: [String: Any]?) {
        runOnMain { [weak self] in
            guard let self else { return }
            guard UIApplication.shared.isProtectedDataAvailable else { return }
            guard let bridge = Self.findBridgeViewController(), let webView = bridge.webView else { return }
            var detail: [String: Any] = ["callId": callId.lowercased()]
            if let caller { detail["caller"] = caller }
            guard let detailData = try? JSONSerialization.data(withJSONObject: detail),
                  let detailJson = String(data: detailData, encoding: .utf8) else { return }
            let js = """
            (function(){ try { window.dispatchEvent(new CustomEvent('aimediatank-native-call-connected', { detail: \\(detailJson) })); } catch (e) {} })();
            """
            webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    private static func findBridgeViewController() -> CAPBridgeViewController? {
        for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
            for window in scene.windows {
                if let bridge = findBridge(in: window.rootViewController) { return bridge }
            }
        }
        return nil
    }

    private static func findBridge(in viewController: UIViewController?) -> CAPBridgeViewController? {
        guard let viewController else { return nil }
        if let bridge = viewController as? CAPBridgeViewController { return bridge }
        for child in viewController.children {
            if let bridge = findBridge(in: child) { return bridge }
        }
        return nil
    }
}
