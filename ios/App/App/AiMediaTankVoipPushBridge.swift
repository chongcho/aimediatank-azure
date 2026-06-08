import AVFoundation
import CallKit
import Foundation
import PushKit

/// App-target VoIP handler so cancel pushes dismiss CallKit before Capacitor plugins load.
final class AiMediaTankVoipPushBridge: NSObject, PKPushRegistryDelegate {
    static let shared = AiMediaTankVoipPushBridge()

    static let incomingPushNotification = Notification.Name("AiMediaTankVoipIncomingPush")
    static let incomingPushDoneNotification = Notification.Name("AiMediaTankVoipIncomingPushDone")
    static let voipTokenNotification = Notification.Name("AiMediaTankVoipPushToken")

    private static let ringingCallIdsKey = "AiMediaTank.ringingCallIds"

    private var pushRegistry: PKPushRegistry?
    private let provider: CXProvider
    private let callController = CXCallController()

    private override init() {
        let configuration = CXProviderConfiguration(localizedName: "AiMediaTank")
        configuration.supportsVideo = true
        configuration.maximumCallGroups = 1
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic, .phoneNumber, .emailAddress]
        configuration.includesCallsInRecents = true
        provider = CXProvider(configuration: configuration)
        super.init()
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

    func dismissRingingCall(uuid: UUID) {
        provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        let endCallAction = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: endCallAction)) { _ in }
        Self.noteCallDismissed(uuid.uuidString.lowercased())
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    func dismissAllRingingCalls(preferredCallId: String? = nil) {
        if let preferredCallId,
           let uuid = UUID(uuidString: preferredCallId.lowercased()) {
            dismissRingingCall(uuid: uuid)
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
        dismissAllRingingCalls(preferredCallId: callId)
        for delay in [0.25, 0.5, 1.0, 2.0, 4.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                self?.dismissAllRingingCalls(preferredCallId: callId)
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

        if payloadString(payloadDict, key: "action") == "cancel",
           let cancelCallId = payloadString(payloadDict, key: "callId") {
            scheduleDismissRetries(for: cancelCallId)
            completion()
            return
        }

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

        NotificationCenter.default.post(
            name: Self.incomingPushNotification,
            object: nil,
            userInfo: userInfo(from: payloadDict)
        )
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        print("[AiMediaTankVoipPushBridge] Push token invalidated for type: \(type)")
    }
}
