import AVFoundation
import Capacitor
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
    private var isAnswering = false
    private var audioSessionReady = false
    private var pendingStart = false
    private var icePollGeneration: UUID?
    private var bootstrapGeneration: UUID?
    private var cachedCaller: [String: Any]?
    private(set) var isMediaConnected = false

    private override init() {
        super.init()
    }

    /// Defer WebRTC init until answer ? avoids crashes during PushKit cold wake.
    private func peerConnectionFactory() -> RTCPeerConnectionFactory {
        if let factory { return factory }
        RTCInitializeSSL()
        let created = RTCPeerConnectionFactory()
        factory = created
        return created
    }

    var isActive: Bool {
        peerConnection != nil || isAnswering
    }

    var activeCallId: String? {
        callId
    }

    func prepareAnswer(callId: String, token: String, baseURL: String) {
        let normalized = callId.lowercased()
        if isAnswering, self.callId == normalized, pendingStart || peerConnection != nil {
            return
        }
        if isActive, self.callId != normalized {
            tearDownPeerConnection(notify: false)
        }

        self.callId = normalized
        self.token = token
        self.baseURL = baseURL
        isAnswering = true
        pendingStart = true
        appliedRemoteIceKeys.removeAll()
        cachedCaller = nil
        isMediaConnected = false

        print("[NativeVoiceCallEngine] prepare answer \(normalized)")
        postTrace(callId: normalized, token: token, event: "native_webrtc_prepare")

        if audioSessionReady {
            beginAnswerIfNeeded()
        }
    }

    func audioSessionActivated() {
        audioSessionReady = true
        RTCAudioSession.sharedInstance().audioSessionDidActivate(AVAudioSession.sharedInstance())
        RTCAudioSession.sharedInstance().isAudioEnabled = true
        beginAnswerIfNeeded()
    }

    func audioSessionDeactivated() {
        RTCAudioSession.sharedInstance().audioSessionDidDeactivate(AVAudioSession.sharedInstance())
        RTCAudioSession.sharedInstance().isAudioEnabled = false
        audioSessionReady = false
    }

    func endCall(reason: String = "user", syncServer: Bool = true) {
        print("[NativeVoiceCallEngine] end call \(callId ?? "nil") reason=\(reason)")
        stopIcePoll()
        bootstrapGeneration = nil
        isAnswering = false
        pendingStart = false
        isMediaConnected = false

        if syncServer, let callId, let token {
            postNativeCallKit(action: "end", callId: callId, token: token)
        }

        tearDownPeerConnection(notify: true)
        self.callId = nil
        self.token = nil
        cachedCaller = nil
    }

    func syncUiIfConnected() {
        guard isMediaConnected, let callId else { return }
        scheduleConnectedUiSync(callId: callId, caller: cachedCaller)
    }

    private func beginAnswerIfNeeded() {
        guard pendingStart, isAnswering, audioSessionReady else { return }
        guard let callId, let token, !token.isEmpty else { return }
        pendingStart = false

        postNativeCallKit(action: "accept", callId: callId, token: token)
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
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
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
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                            self.bootstrapUntilOfferReady(callId: callId, token: token, attempt: attempt + 1)
                        }
                    } else {
                        self.failCall(callId: callId, error: "offer missing")
                    }
                    return
                }
                DispatchQueue.main.async {
                    self.createAnswer(callId: callId, token: token, offerSdp: offerSdp, iceServers: bootstrap.iceServers)
                    for candidate in bootstrap.remoteIceCandidates {
                        self.addRemoteIceCandidate(candidate, callId: callId)
                    }
                    self.startIcePoll(callId: callId, token: token)
                }
            }
        }
    }

    private func createAnswer(callId: String, token: String, offerSdp: String, iceServers: [RTCIceServer]) {
        tearDownPeerConnection(notify: false)

        let config = RTCConfiguration()
        config.iceServers = iceServers
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually

        let constraints = RTCMediaConstraints(
            mandatoryConstraints: nil,
            optionalConstraints: ["DtlsSrtpKeyAgreement": "true"]
        )

        guard let pc = peerConnectionFactory().peerConnection(with: config, constraints: constraints, delegate: self) else {
            failCall(callId: callId, error: "peer connection create failed")
            return
        }
        peerConnection = pc

        let audioSource = peerConnectionFactory().audioSource(with: RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil))
        let audioTrack = peerConnectionFactory().audioTrack(with: audioSource, trackId: "audio0")
        pc.add(audioTrack, streamIds: ["stream0"])

        let offer = RTCSessionDescription(type: .offer, sdp: offerSdp)
        pc.setRemoteDescription(offer) { [weak self] error in
            guard let self else { return }
            if let error {
                self.failCall(callId: callId, error: "setRemoteDescription: \(error.localizedDescription)")
                return
            }
            pc.answer(for: constraints) { answer, error in
                if let error {
                    self.failCall(callId: callId, error: "createAnswer: \(error.localizedDescription)")
                    return
                }
                guard let answer else {
                    self.failCall(callId: callId, error: "createAnswer returned nil")
                    return
                }
                pc.setLocalDescription(answer) { error in
                    if let error {
                        self.failCall(callId: callId, error: "setLocalDescription: \(error.localizedDescription)")
                        return
                    }
                    self.postSignal(
                        callId: callId,
                        token: token,
                        type: "answer",
                        payload: ["sdp": ["type": answer.type.rawValue, "sdp": answer.sdp]]
                    )
                    self.postTrace(callId: callId, token: token, event: "native_webrtc_answer_sent")
                }
            }
        }
    }

    private func tearDownPeerConnection(notify: Bool) {
        stopIcePoll()
        peerConnection?.close()
        peerConnection = nil
        if notify, let callId {
            delegate?.nativeVoiceCallEngineDidEnd(callId: callId)
            injectUiEvent(name: "aimediatank-callkit-end", callId: callId)
        }
    }

    private func failCall(callId: String, error: String) {
        print("[NativeVoiceCallEngine] failed \(callId): \(error)")
        postTrace(callId: callId, token: token ?? "", event: "native_webrtc_failed", detail: ["error": error])
        isAnswering = false
        pendingStart = false
        bootstrapGeneration = nil
        tearDownPeerConnection(notify: false)
        delegate?.nativeVoiceCallEngineDidFail(callId: callId, error: error)
        injectUiEvent(name: "aimediatank-callkit-end", callId: callId)
        self.callId = nil
        self.token = nil
    }

    private func markConnected(callId: String) {
        guard isAnswering || peerConnection != nil else { return }
        guard !isMediaConnected else { return }
        isMediaConnected = true
        isAnswering = false
        pendingStart = false
        bootstrapGeneration = nil
        print("[NativeVoiceCallEngine] connected \(callId)")
        postTrace(callId: callId, token: token ?? "", event: "native_webrtc_connected")
        delegate?.nativeVoiceCallEngineDidConnect(callId: callId, caller: cachedCaller)
        scheduleConnectedUiSync(callId: callId, caller: cachedCaller)
    }

    private func scheduleConnectedUiSync(callId: String, caller: [String: Any]?) {
        let normalized = callId.lowercased()
        let delays: [TimeInterval] = [0, 1, 2, 4, 8, 15, 30, 60, 120]
        for delay in delays {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, self.isMediaConnected, self.callId == normalized else { return }
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
            guard self.peerConnection != nil else { return }
            self.fetchBootstrap(callId: callId, token: token) { result in
                guard self.icePollGeneration == generation else { return }
                if case .success(let bootstrap) = result {
                    for candidate in bootstrap.remoteIceCandidates {
                        self.addRemoteIceCandidate(candidate, callId: callId)
                    }
                }
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

    private func addRemoteIceCandidate(_ dict: [String: Any], callId: String) {
        guard let pc = peerConnection else { return }
        let key = candidateKey(dict)
        guard !appliedRemoteIceKeys.contains(key) else { return }
        appliedRemoteIceKeys.insert(key)
        guard let sdp = dict["candidate"] as? String, !sdp.isEmpty else { return }
        let mLineIndex = Int32(dict["sdpMLineIndex"] as? Int ?? 0)
        let sdpMid = dict["sdpMid"] as? String
        pc.add(RTCIceCandidate(sdp: sdp, sdpMLineIndex: mLineIndex, sdpMid: sdpMid)) { _ in }
    }

    private func candidateKey(_ dict: [String: Any]) -> String {
        if let data = try? JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys]) {
            return String(data: data, encoding: .utf8) ?? UUID().uuidString
        }
        return UUID().uuidString
    }

    // MARK: - RTCPeerConnectionDelegate

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}
    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}
    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {
        guard let callId else { return }
        switch newState {
        case .connected, .completed:
            markConnected(callId: callId)
        case .failed:
            failCall(callId: callId, error: "ICE failed")
        default:
            break
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        guard let callId, let token else { return }
        postSignal(
            callId: callId,
            token: token,
            type: "ice",
            payload: [
                "candidate": [
                    "candidate": candidate.sdp,
                    "sdpMLineIndex": candidate.sdpMLineIndex,
                    "sdpMid": candidate.sdpMid ?? "",
                ],
            ]
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

    private static func extractSdp(from value: Any?) -> String? {
        guard let value else { return nil }
        if let str = value as? String, str.contains("v=0") { return str }
        guard let obj = value as? [String: Any] else { return nil }
        if let sdp = obj["sdp"] as? String { return sdp }
        if let nested = obj["sdp"] as? [String: Any], let sdp = nested["sdp"] as? String { return sdp }
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

    private func injectUiEvent(name: String, callId: String, extra: [String: Any] = [:]) {
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

    private func injectNativeConnected(callId: String, caller: [String: Any]?) {
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

    private static func findBridgeViewController() -> CAPBridgeViewController? {
        for scene in UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }) {
            for window in scene.windows where window.isKeyWindow {
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
