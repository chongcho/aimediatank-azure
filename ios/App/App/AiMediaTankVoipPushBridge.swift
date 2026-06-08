import AVFoundation
import CallKit
import Foundation
import PushKit
import UIKit

/// App-target VoIP + CallKit handler. Owns the CXProvider used for PushKit incoming/cancel pushes
/// so reportNewIncomingCall and reportCall ended use the same provider instance on lock screen.
final class AiMediaTankVoipPushBridge: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
    static let shared = AiMediaTankVoipPushBridge()

    static let incomingPushNotification = Notification.Name("AiMediaTankVoipIncomingPush")
    static let incomingPushDoneNotification = Notification.Name("AiMediaTankVoipIncomingPushDone")
    static let cancelPushNotification = Notification.Name("AiMediaTankVoipCancelPush")
    static let voipTokenNotification = Notification.Name("AiMediaTankVoipPushToken")
    static let callKitAnswerNotification = Notification.Name("AiMediaTankCallKitAnswer")
    static let callKitEndNotification = Notification.Name("AiMediaTankCallKitEnd")

    private static let ringingCallIdsKey = "AiMediaTank.ringingCallIds"
    private static let cancelledCallIdsKey = "AiMediaTank.cancelledCallIds"
    private static let pendingAnswerCallIdKey = "AiMediaTank.pendingCallKitAnswerCallId"

    private static func declineTokenKey(for callId: String) -> String {
        "AiMediaTank.declineToken.\(callId.lowercased())"
    }

    private var pushRegistry: PKPushRegistry?
    private let provider: CXProvider
    private let callController = CXCallController()
    /// Stops in-flight native-status polls when the watch generation changes.
    private var statusWatchGeneration: [String: UUID] = [:]
    private var statusBackgroundTasks: [String: UIBackgroundTaskIdentifier] = [:]
    /// Stops stale dismiss retries from ending a newer incoming call.
    private var dismissRetryGeneration: [String: UUID] = [:]
    /// Avoid replaying the same pending CallKit answer repeatedly.
    private var lastReplayedPendingAnswerCallId: String?

    private override init() {
        let configuration = CXProviderConfiguration(localizedName: "AiMediaTank")
        // Audio-only: lock screen shows Accept/Decline instead of in-call Video/More grid.
        configuration.supportsVideo = false
        configuration.maximumCallGroups = 1
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic, .phoneNumber, .emailAddress]
        configuration.includesCallsInRecents = true
        configuration.ringtoneSound = "incoming-ring.wav"
        // Do not set iconTemplateImageData here — a full-size AppIcon PNG can crash CallKit.
        provider = CXProvider(configuration: configuration)
        super.init()
        provider.setDelegate(self, queue: nil)
    }

    private func configureAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
            )
            try audioSession.setActive(true)
        } catch {
            print("[AiMediaTankVoipPushBridge] audio session configure failed: \(error.localizedDescription)")
        }
    }

    private func markPendingCallKitAnswer(callId: String) {
        UserDefaults.standard.set(callId.lowercased(), forKey: Self.pendingAnswerCallIdKey)
    }

    private func clearPendingCallKitAnswer() {
        UserDefaults.standard.removeObject(forKey: Self.pendingAnswerCallIdKey)
        lastReplayedPendingAnswerCallId = nil
    }

    /// Re-deliver CallKit answer to JS when the WebView was not ready (lock-screen accept).
    func replayPendingCallKitAnswerIfNeeded() {
        guard let callId = UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey),
              !callId.isEmpty else { return }
        if lastReplayedPendingAnswerCallId == callId { return }
        lastReplayedPendingAnswerCallId = callId
        print("[AiMediaTankVoipPushBridge] replay pending CallKit answer for \(callId)")
        NotificationCenter.default.post(
            name: Self.callKitAnswerNotification,
            object: nil,
            userInfo: ["callId": callId]
        )
    }

    func ensureStarted() {
        guard pushRegistry == nil else { return }
        let registry = PKPushRegistry(queue: DispatchQueue.main)
        registry.delegate = self
        registry.desiredPushTypes = [.voIP]
        pushRegistry = registry

        NotificationCenter.default.addObserver(
            forName: Notification.Name("AiMediaTankNoteIncomingCall"),
            object: nil,
            queue: .main
        ) { notification in
            if let callId = notification.userInfo?["callId"] as? String {
                Self.noteIncomingCallReported(callId)
            }
        }

        NotificationCenter.default.addObserver(
            forName: Notification.Name("AiMediaTankStartCallStatusWatch"),
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self,
                  let callId = notification.userInfo?["callId"] as? String,
                  let token = notification.userInfo?["token"] as? String else { return }
            self.startCallStatusWatch(callId: callId, token: token)
        }

        NotificationCenter.default.addObserver(
            forName: Notification.Name("AiMediaTankRequestBridgeDismiss"),
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self,
                  let callId = notification.userInfo?["callId"] as? String else { return }
            self.performCancelDismiss(callId: callId, source: "bridge_dismiss_request")
        }

        replayPendingCallKitAnswerIfNeeded()
    }

    static func noteIncomingCallReported(_ callId: String) {
        let normalized = callId.lowercased()
        var ids = UserDefaults.standard.stringArray(forKey: ringingCallIdsKey) ?? []
        if !ids.contains(normalized) {
            ids.append(normalized)
            UserDefaults.standard.set(ids, forKey: ringingCallIdsKey)
        }
    }

    static func noteCallDismissed(_ callId: String) {
        let normalized = callId.lowercased()
        var ids = UserDefaults.standard.stringArray(forKey: ringingCallIdsKey) ?? []
        ids.removeAll { $0 == normalized }
        UserDefaults.standard.set(ids, forKey: ringingCallIdsKey)
    }

    static func markCallCancelled(_ callId: String) {
        let normalized = callId.lowercased()
        var ids = UserDefaults.standard.stringArray(forKey: cancelledCallIdsKey) ?? []
        if !ids.contains(normalized) {
            ids.append(normalized)
            UserDefaults.standard.set(ids, forKey: cancelledCallIdsKey)
        }
    }

    static func isCallCancelled(_ callId: String) -> Bool {
        UserDefaults.standard.stringArray(forKey: cancelledCallIdsKey)?
            .contains(callId.lowercased()) ?? false
    }

    static func clearCallCancelled(_ callId: String) {
        let normalized = callId.lowercased()
        var ids = UserDefaults.standard.stringArray(forKey: cancelledCallIdsKey) ?? []
        ids.removeAll { $0 == normalized }
        UserDefaults.standard.set(ids, forKey: cancelledCallIdsKey)
    }

    private func cancelDismissRetries(callId: String) {
        dismissRetryGeneration.removeValue(forKey: callId.lowercased())
    }

    private func cancelDismissRetries(except callId: String) {
        let normalized = callId.lowercased()
        dismissRetryGeneration = dismissRetryGeneration.filter { $0.key == normalized }
    }

    private func stopStatusWatches(except callId: String) {
        let normalized = callId.lowercased()
        for key in statusWatchGeneration.keys where key != normalized {
            stopCallStatusWatch(callId: key)
        }
    }

    /// End stale CallKit rings from a prior attempt so a new incoming call can be reported.
    private func dismissOtherRingingCalls(exceptCallId: String) {
        let normalized = exceptCallId.lowercased()
        let observer = CXCallObserver()
        for call in observer.calls where !call.hasEnded && !call.isOutgoing && !call.hasConnected {
            if call.uuid.uuidString.lowercased() != normalized {
                dismissRingingCall(uuid: call.uuid)
            }
        }
        var storedIds = UserDefaults.standard.stringArray(forKey: Self.ringingCallIdsKey) ?? []
        storedIds.removeAll { $0 != normalized }
        UserDefaults.standard.set(storedIds, forKey: Self.ringingCallIdsKey)
    }

    /// Tear down timers from a prior call so they cannot dismiss the next incoming call.
    private func prepareForNewIncomingCall(callId: String) {
        let normalized = callId.lowercased()
        Self.clearCallCancelled(normalized)
        cancelDismissRetries(except: normalized)
        stopStatusWatches(except: normalized)
        // Do not dismiss CallKit calls synchronously during PushKit — iOS can crash/reject.
    }

    func dismissRingingCall(uuid: UUID) {
        let dismiss = { [weak self] in
            guard let self = self else { return }
            let callId = uuid.uuidString.lowercased()
            self.provider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
            let endCallAction = CXEndCallAction(call: uuid)
            self.callController.request(CXTransaction(action: endCallAction)) { error in
                if let error {
                    print("[AiMediaTankVoipPushBridge] CXEndCallAction failed for \(uuid): \(error.localizedDescription)")
                }
            }
            NotificationCenter.default.post(
                name: Self.cancelPushNotification,
                object: nil,
                userInfo: ["callId": callId]
            )
            Self.noteCallDismissed(callId)
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        if Thread.isMainThread {
            dismiss()
        } else {
            DispatchQueue.main.async(execute: dismiss)
        }
    }

    func dismissAllRingingCalls(preferredCallId: String? = nil) {
        if let preferredCallId,
           let uuid = UUID(uuidString: preferredCallId.lowercased()) {
            dismissRingingCall(uuid: uuid)
            return
        }

        let observer = CXCallObserver()
        for call in observer.calls where !call.hasEnded && !call.isOutgoing && !call.hasConnected {
            dismissRingingCall(uuid: call.uuid)
        }

        for storedId in UserDefaults.standard.stringArray(forKey: Self.ringingCallIdsKey) ?? [] {
            if let uuid = UUID(uuidString: storedId) {
                dismissRingingCall(uuid: uuid)
            }
        }
    }

    func scheduleDismissRetries(for callId: String) {
        let normalized = callId.lowercased()
        let generation = UUID()
        dismissRetryGeneration[normalized] = generation

        for delay in [0.25, 0.5, 1.0, 2.0, 4.0, 6.0, 8.0, 10.0, 15.0, 20.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self = self,
                      self.dismissRetryGeneration[normalized] == generation,
                      let uuid = UUID(uuidString: normalized) else { return }
                self.dismissRingingCall(uuid: uuid)
            }
        }
    }

    private func payloadString(_ dict: [AnyHashable: Any], key: String) -> String? {
        if let value = dict[key] as? String { return value }
        if let value = dict[key] as? NSString { return value as String }
        if let nested = dict["data"] as? [AnyHashable: Any] {
            if let value = nested[key] as? String { return value }
            if let value = nested[key] as? NSString { return value as String }
        }
        return nil
    }

    private func userInfo(from dict: [AnyHashable: Any]) -> [String: Any] {
        var result: [String: Any] = [:]
        for (key, value) in dict {
            result[String(describing: key)] = value
        }
        return result
    }

    private func handleType(from string: String) -> CXHandle.HandleType {
        switch string {
        case "phone": return .phoneNumber
        case "email": return .emailAddress
        default: return .generic
        }
    }

    private func reportIncomingToCallKit(
        callId: UUID,
        handle: String,
        displayName: String,
        handleType: CXHandle.HandleType,
        video: Bool,
        completion: @escaping (Bool) -> Void
    ) {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: handleType, value: handle)
        update.localizedCallerName = displayName
        update.supportsHolding = true
        update.supportsGrouping = false
        update.supportsUngrouping = false
        update.supportsDTMF = true
        update.hasVideo = false

        func attemptReport(retryAfterCleanup: Bool) {
            provider.reportNewIncomingCall(with: callId, update: update) { [weak self] error in
                if let error {
                    print("[AiMediaTankVoipPushBridge] reportNewIncomingCall failed (retry=\(retryAfterCleanup)): \(error.localizedDescription)")
                    guard let self, !retryAfterCleanup else {
                        completion(false)
                        return
                    }
                    DispatchQueue.main.async {
                        self.dismissOtherRingingCalls(exceptCallId: callId.uuidString)
                        attemptReport(retryAfterCleanup: true)
                    }
                    return
                }
                completion(true)
            }
        }

        attemptReport(retryAfterCleanup: false)
    }

    private func performCancelDismiss(callId: String, source: String) {
        let normalized = callId.lowercased()
        if Self.isCallCancelled(normalized) {
            cancelDismissRetries(callId: normalized)
            stopCallStatusWatch(callId: normalized)
            return
        }
        reportCancelAck(callId: normalized, source: source)
        Self.markCallCancelled(normalized)
        stopCallStatusWatch(callId: normalized)
        dismissAllRingingCalls(preferredCallId: normalized)
        scheduleDismissRetries(for: normalized)
    }

    /// POST to server so Azure logs prove the iPhone received/processed cancel on lock screen.
    private func reportCancelAck(callId: String, source: String) {
        let normalized = callId.lowercased()
        let token = UserDefaults.standard.string(forKey: Self.declineTokenKey(for: normalized)) ?? ""
        guard let url = URL(string: "\(voiceApiBaseURL())/api/chat/voice/native-cancel-ack") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: String] = [
            "callId": normalized,
            "source": source,
        ]
        if !token.isEmpty {
            body["token"] = token
        }
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: request) { _, response, error in
            if let error {
                print("[AiMediaTankVoipPushBridge] cancel ack failed source=\(source) call=\(normalized): \(error.localizedDescription)")
                return
            }
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            print("[AiMediaTankVoipPushBridge] cancel ack HTTP \(code) source=\(source) call=\(normalized)")
        }.resume()
    }

    private func voiceApiBaseURL() -> String {
        if let path = Bundle.main.path(forResource: "capacitor.config", ofType: "json"),
           let data = try? Data(contentsOf: URL(fileURLWithPath: path)),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let server = json["server"] as? [String: Any],
           let url = server["url"] as? String,
           !url.isEmpty {
            return url.hasSuffix("/") ? String(url.dropLast()) : url
        }
        return "https://aimediatank.com"
    }

    private func declineToken(from dict: [AnyHashable: Any]) -> String? {
        if let token = payloadString(dict, key: "declineToken") { return token }
        if let metadata = dict["metadata"] as? [AnyHashable: Any] {
            return payloadString(metadata, key: "declineToken")
        }
        return nil
    }

    /// Poll server call status from the App target (works on lock screen without Capacitor/JS).
    func startCallStatusWatch(callId: String, token: String) {
        let normalized = callId.lowercased()
        stopCallStatusWatch(callId: normalized)
        let generation = UUID()
        statusWatchGeneration[normalized] = generation

        var bgTask = UIBackgroundTaskIdentifier.invalid
        bgTask = UIApplication.shared.beginBackgroundTask(withName: "AiMediaTank call status watch") { [weak self] in
            self?.stopCallStatusWatch(callId: normalized)
        }
        if bgTask != .invalid {
            statusBackgroundTasks[normalized] = bgTask
        }

        print("[AiMediaTankVoipPushBridge] status watch started for call \(normalized)")

        func poll(attempt: Int) {
            guard self.statusWatchGeneration[normalized] == generation, attempt < 180 else {
                self.stopCallStatusWatch(callId: normalized)
                return
            }
            self.fetchCallStatus(callId: normalized, token: token) { stillRinging in
                guard self.statusWatchGeneration[normalized] == generation else { return }
                if stillRinging {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        poll(attempt: attempt + 1)
                    }
                } else {
                    print("[AiMediaTankVoipPushBridge] status watch dismiss call \(normalized)")
                    self.performCancelDismiss(callId: normalized, source: "status_poll")
                }
            }
        }

        poll(attempt: 0)
    }

    func stopCallStatusWatch(callId: String) {
        let normalized = callId.lowercased()
        statusWatchGeneration.removeValue(forKey: normalized)
        if let bgTask = statusBackgroundTasks.removeValue(forKey: normalized), bgTask != .invalid {
            UIApplication.shared.endBackgroundTask(bgTask)
        }
    }

    private func fetchCallStatus(callId: String, token: String, completion: @escaping (Bool) -> Void) {
        var components = URLComponents(string: "\(voiceApiBaseURL())/api/chat/voice/native-status")!
        components.queryItems = [
            URLQueryItem(name: "callId", value: callId),
            URLQueryItem(name: "token", value: token),
        ]
        guard let url = components.url else {
            completion(true)
            return
        }
        URLSession.shared.dataTask(with: url) { data, response, error in
            if let error {
                print("[AiMediaTankVoipPushBridge] status poll error: \(error.localizedDescription)")
                completion(true)
                return
            }
            if let http = response as? HTTPURLResponse, http.statusCode != 200 {
                print("[AiMediaTankVoipPushBridge] status poll HTTP \(http.statusCode) for call \(callId)")
                completion(true)
                return
            }
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let status = json["status"] as? String else {
                completion(true)
                return
            }
            completion(status == "ringing" || status == "active")
        }.resume()
    }

    // MARK: - PKPushRegistryDelegate

    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        NotificationCenter.default.post(
            name: Self.voipTokenNotification,
            object: pushCredentials.token
        )
    }

    func pushRegistry(
        _ registry: PKPushRegistry,
        didReceiveIncomingPushWith payload: PKPushPayload,
        for type: PKPushType,
        completion: @escaping () -> Void
    ) {
        guard type == .voIP else {
            completion()
            return
        }

        let payloadDict = payload.dictionaryPayload

        if payloadString(payloadDict, key: "action") == "cancel" {
            if let cancelCallId = payloadString(payloadDict, key: "callId") {
                let normalizedCallId = cancelCallId.lowercased()
                print("[AiMediaTankVoipPushBridge] cancel push RECEIVED for call \(normalizedCallId) payloadKeys=\(payloadDict.keys.map { String(describing: $0) }.joined(separator: ","))")
                performCancelDismiss(callId: normalizedCallId, source: "voip_cancel_push")
            } else {
                print("[AiMediaTankVoipPushBridge] cancel push MISSING callId payloadKeys=\(payloadDict.keys.map { String(describing: $0) }.joined(separator: ","))")
            }
            completion()
            return
        }

        guard let callIdString = payloadString(payloadDict, key: "callId"),
              let callId = UUID(uuidString: callIdString),
              let handle = payloadString(payloadDict, key: "handle"),
              let displayName = payloadString(payloadDict, key: "displayName") else {
            print("[AiMediaTankVoipPushBridge] ignored VoIP push (not cancel/incoming) keys=\(payloadDict.keys.map { String(describing: $0) }.joined(separator: ","))")
            completion()
            return
        }

        if Self.isCallCancelled(callIdString) {
            print("[AiMediaTankVoipPushBridge] ignored incoming push — call already cancelled \(callIdString.lowercased())")
            completion()
            return
        }

        prepareForNewIncomingCall(callId: callIdString)

        var completed = false
        let completeOnce = {
            if completed { return }
            completed = true
            completion()
        }

        let doneObserver = NotificationCenter.default.addObserver(
            forName: Self.incomingPushDoneNotification,
            object: nil,
            queue: .main
        ) { _ in
            completeOnce()
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 25) {
            NotificationCenter.default.removeObserver(doneObserver)
            completeOnce()
        }

        let handleTypeString = payloadString(payloadDict, key: "handleType") ?? "generic"
        let video = payloadDict["video"] as? Bool ?? false

        reportIncomingToCallKit(
            callId: callId,
            handle: handle,
            displayName: displayName,
            handleType: handleType(from: handleTypeString),
            video: video
        ) { [weak self] reported in
            guard let self = self else {
                completeOnce()
                return
            }
            var info = self.userInfo(from: payloadDict)
            info["reportedToCallKit"] = reported
            if reported {
                Self.noteIncomingCallReported(callIdString)
            }
            if reported, let token = self.declineToken(from: payloadDict) {
                UserDefaults.standard.set(token, forKey: Self.declineTokenKey(for: callIdString.lowercased()))
                self.startCallStatusWatch(callId: callIdString.lowercased(), token: token)
            } else if reported {
                print("[AiMediaTankVoipPushBridge] no declineToken — status watch disabled for \(callIdString)")
            }
            NotificationCenter.default.post(
                name: Self.incomingPushNotification,
                object: nil,
                userInfo: info
            )
        }
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        print("[AiMediaTankVoipPushBridge] Push token invalidated for type: \(type)")
    }

    // MARK: - CXProviderDelegate

    func providerDidReset(_ provider: CXProvider) {
        print("[AiMediaTankVoipPushBridge] providerDidReset — clearing stale VoIP call state")
        statusWatchGeneration.keys.forEach { stopCallStatusWatch(callId: $0) }
        dismissRetryGeneration.removeAll()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let callId = action.callUUID.uuidString.lowercased()
        stopCallStatusWatch(callId: callId)
        configureAudioSession()
        markPendingCallKitAnswer(callId: callId)
        NotificationCenter.default.post(
            name: Self.callKitAnswerNotification,
            object: nil,
            userInfo: ["callId": callId]
        )
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let callId = action.callUUID.uuidString.lowercased()
        stopCallStatusWatch(callId: callId)
        clearPendingCallKitAnswer()
        NotificationCenter.default.post(
            name: Self.callKitEndNotification,
            object: nil,
            userInfo: ["callId": callId]
        )
        provider.reportCall(with: action.callUUID, endedAt: Date(), reason: .remoteEnded)
        Self.noteCallDismissed(callId)
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        action.fulfill()
    }

    func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        print("[AiMediaTankVoipPushBridge] CallKit action timed out: \(action)")
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        configureAudioSession()
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {}
}
