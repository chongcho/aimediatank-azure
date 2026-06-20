import AVFoundation
import CallKit
import Capacitor
import Foundation
import PushKit
import UIKit
import WebRTC

/// App-target VoIP + CallKit handler. Single CXProvider for all incoming rings (PushKit + JS fallback).
/// PushKit, reportNewIncomingCall, answer/decline/cancel, and audio session live here only.
final class AiMediaTankVoipPushBridge: NSObject, PKPushRegistryDelegate, CXProviderDelegate {
    static let shared = AiMediaTankVoipPushBridge()

    static let incomingPushNotification = Notification.Name("AiMediaTankVoipIncomingPush")
    static let incomingPushDoneNotification = Notification.Name("AiMediaTankVoipIncomingPushDone")
    static let cancelPushNotification = Notification.Name("AiMediaTankVoipCancelPush")
    static let voipTokenNotification = Notification.Name("AiMediaTankVoipPushToken")
    static let callKitAnswerNotification = Notification.Name("AiMediaTankCallKitAnswer")
    static let callKitEndNotification = Notification.Name("AiMediaTankCallKitEnd")
    static let jsIncomingCallNotification = Notification.Name("AiMediaTankJsIncomingCallReport")
    static let prepareUnlockedIncomingNotification = Notification.Name("AiMediaTankPrepareUnlockedIncoming")

    private static let voipTokenHexKey = "AiMediaTank.voipPushTokenHex"
    private static let voipTokenServerSyncedHexKey = "AiMediaTank.voipPushTokenServerSyncedHex"
    private static let lastMigratedAppBuildKey = "AiMediaTank.lastMigratedAppBuild"
    private static let nativePushUserIdKey = "AiMediaTank.nativePushUserId"
    private static let nativePushRegisterKeyKey = "AiMediaTank.nativePushRegisterKey"
    static let storeNativePushCredentialsNotification = Notification.Name("AiMediaTankStoreNativePushCredentials")
    private static let ringingCallIdsKey = "AiMediaTank.ringingCallIds"
    private static let cancelledCallIdsKey = "AiMediaTank.cancelledCallIds"
    private static let pendingAnswerCallIdKey = "AiMediaTank.pendingCallKitAnswerCallId"
    private static let incomingReportedAtKeyPrefix = "AiMediaTank.incomingReportedAt."
    /// Ignore native-status dismiss while CallKit incoming UI is still settling.
    private static let statusPollGraceSeconds: TimeInterval = 15
    private static let statusPollStartDelaySeconds: TimeInterval = 3
    /// End ghost CallKit sessions if WebRTC never connects after Accept (in-app retests).
    private static let webrtcConnectWatchdogSeconds: TimeInterval = 45
    static let bridgeEndCallNotification = Notification.Name("AiMediaTankRequestBridgeEndCall")

    private static func declineTokenKey(for callId: String) -> String {
        "AiMediaTank.declineToken.\(callId.lowercased())"
    }

    /// Lock-screen Accept uses native WebRTC; JS must not start session WebRTC for this call.
    private static func lockScreenNativeAnswerKey(for callId: String) -> String {
        "AiMediaTank.lockScreenNativeAnswer.\(callId.lowercased())"
    }

    private static func markLockScreenNativeAnswer(callId: String) {
        UserDefaults.standard.set(true, forKey: lockScreenNativeAnswerKey(for: callId))
    }

    private static func clearLockScreenNativeAnswer(callId: String) {
        UserDefaults.standard.removeObject(forKey: lockScreenNativeAnswerKey(for: callId))
    }

    private static func isLockScreenNativeAnswer(callId: String) -> Bool {
        UserDefaults.standard.bool(forKey: lockScreenNativeAnswerKey(for: callId))
    }

    /// Drop burst incoming VoIP pushes after the user already answered (not while CallKit is merely ringing).
    private func isIncomingCallAlreadyHandled(callId: String) -> Bool {
        let normalized = callId.lowercased()
        if NativeVoiceCallEngine.shared.activeCallId?.lowercased() == normalized,
           NativeVoiceCallEngine.shared.isActive {
            return true
        }
        guard UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased() == normalized else {
            return false
        }
        return true
    }

    private var pushRegistry: PKPushRegistry?
    private let provider: CXProvider
    private let callController = CXCallController()
    /// Stops in-flight native-status polls when the watch generation changes.
    private var statusWatchGeneration: [String: UUID] = [:]
    private var statusBackgroundTasks: [String: UIBackgroundTaskIdentifier] = [:]
    /// Stops stale dismiss retries from ending a newer incoming call.
    private var dismissRetryGeneration: [String: UUID] = [:]
    /// Lock-screen answer: deliver callAnswered to JS only after CallKit activates the audio session.
    private var pendingJsAnswerCallId: String?
    private var pendingJsAnswerDeclineToken: String?
    /// Retries JS delivery when the WebView is still loading after lock-screen answer.
    private var jsAnswerRetryGeneration: UUID?
    /// Keeps the app alive while WebRTC connects after lock-screen answer.
    private var answerBackgroundTask: UIBackgroundTaskIdentifier = .invalid
    private var connectionWatchdogGeneration: UUID?
    /// Blocks PushKit registry refresh while an incoming VoIP push is being handled.
    private var incomingVoipPushInFlight = 0
    private var audioActivationFallbackGeneration: UUID?

    private static func isForegroundActive() -> Bool {
        guard UIApplication.shared.applicationState == .active else { return false }
        return UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .contains(where: { $0.activationState == .foregroundActive })
    }

    private static func isWebViewRunnable() -> Bool {
        switch UIApplication.shared.applicationState {
        case .active, .inactive:
            return true
        case .background:
            return false
        @unknown default:
            return false
        }
    }

    /// WKWebView + Capacitor JS must not run until protected data is available (avoids lock-screen crash).
    private static func canDeliverToWebView() -> Bool {
        guard UIApplication.shared.isProtectedDataAvailable else { return false }
        return isWebViewRunnable()
    }

    /// Slide-to-answer on lock keeps the app "active" but protected data is unavailable until the user unlocks.
    private static func isDeviceUnlockedForVoice() -> Bool {
        canDeliverToWebView()
    }

    private func activateAppWindow() {
        guard Self.canDeliverToWebView() else { return }
        guard let scene = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .first(where: { $0.activationState == .foregroundActive || $0.activationState == .foregroundInactive }) else {
            return
        }
        if let window = scene.windows.first(where: { $0.isKeyWindow }) {
            window.makeKeyAndVisible()
        }
    }

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
        NativeVoiceCallEngine.shared.delegate = self
        RTCAudioSession.sharedInstance().useManualAudio = true
    }

    /// Configure category/mode only. CallKit owns activation via didActivate — never call setActive(true) here.
    private func configureAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(
                .playAndRecord,
                mode: .voiceChat,
                options: [.allowBluetoothHFP, .allowBluetoothA2DP, .defaultToSpeaker]
            )
        } catch {
            print("[AiMediaTankVoipPushBridge] audio session configure failed: \(error.localizedDescription)")
        }
    }

    /// Release the shared audio session so cellular Phone calls can use the mic/speaker again.
    private func releaseAudioSession() {
        do {
            try AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            print("[AiMediaTankVoipPushBridge] audio session release failed: \(error.localizedDescription)")
        }
    }

    private func hasPendingCallKitAnswer() -> Bool {
        guard let callId = UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey) else { return false }
        return !callId.isEmpty
    }

    private func hasActiveCallKitCall() -> Bool {
        CXCallObserver().calls.contains { !$0.hasEnded }
    }

    /// Release audio when no CallKit call is in progress (safe during cellular-call interruptions).
    func releaseAudioIfNoConnectedCall() {
        if hasActiveCallKitCall() || hasPendingCallKitAnswer() { return }
        releaseAudioSession()
    }

    /// After a crash or stale CallKit state, tear down audio and orphaned rings so Phone calls work again.
    func recoverFromStaleCallState() {
        if hasPendingCallKitAnswer() { return }

        let observer = CXCallObserver()
        let systemCalls = observer.calls.filter { !$0.hasEnded }
        let storedRinging = Set(UserDefaults.standard.stringArray(forKey: Self.ringingCallIdsKey) ?? [])

        // Dismiss only orphaned rings from a prior session — never fresh lock-screen incoming calls.
        for call in systemCalls where !call.isOutgoing && !call.hasConnected {
            let callId = call.uuid.uuidString.lowercased()
            guard storedRinging.contains(callId) else { continue }
            if Self.isWithinIncomingGracePeriod(callId: callId) {
                print("[AiMediaTankVoipPushBridge] skip stale recovery for active incoming \(callId)")
                continue
            }
            dismissRingingCall(uuid: call.uuid)
        }

        // Connected ghosts from failed in-app tests cause "End & Accept" on the next ring.
        let pendingAnswer = UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased()
        for call in systemCalls where call.hasConnected {
            let callId = call.uuid.uuidString.lowercased()
            if pendingAnswer == callId {
                continue
            }
            print("[AiMediaTankVoipPushBridge] stale recovery — ending connected ghost \(callId)")
            endCallKitCall(uuid: call.uuid, reason: .failed, notifyJs: true)
        }

        // Never release audio while CallKit is answering/connecting — that breaks lock-screen accept.
        if hasActiveCallKitCall() || hasPendingCallKitAnswer() { return }

        releaseAudioSession()
        clearPendingCallKitAnswer()
        statusWatchGeneration.keys.forEach { stopCallStatusWatch(callId: $0) }
        dismissRetryGeneration.removeAll()
        if systemCalls.isEmpty || storedRinging.isEmpty {
            UserDefaults.standard.removeObject(forKey: Self.ringingCallIdsKey)
        }
    }

    /// Dismiss CallKit lock-screen / slide-to-answer UI so the in-app call screen handles the ring.
    /// Does not notify JS of a user decline — use only when the WebView shows Decline/Accept.
    func dismissCallKitUIForInAppOnly(callId: String) {
        if hasPendingCallKitAnswer() { return }
        let normalized = callId.lowercased()
        guard let uuid = UUID(uuidString: normalized) else { return }
        endCallKitCall(uuid: uuid, reason: .unanswered, notifyJs: false)
        print("[AiMediaTankVoipPushBridge] dismissed CallKit UI for in-app call \(normalized)")
    }

    private func dismissTrackedRingingCallsForInAppUI() {
        if hasPendingCallKitAnswer() { return }
        let ringingIds = UserDefaults.standard.stringArray(forKey: Self.ringingCallIdsKey) ?? []
        for callId in ringingIds {
            dismissCallKitUIForInAppOnly(callId: callId)
        }
    }

    /// Tear down stale CallKit calls so the next ring shows Accept/Decline (not End & Accept).
    private func endOrphanedBridgeCallsBeforeIncoming(exceptCallId: String?) {
        let except = exceptCallId?.lowercased()
        let pendingAnswer = UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased()
        let observer = CXCallObserver()
        for call in observer.calls where !call.hasEnded {
            let callId = call.uuid.uuidString.lowercased()
            if let except, callId == except { continue }
            if let pendingAnswer, callId == pendingAnswer { continue }
            print("[AiMediaTankVoipPushBridge] ending orphan before incoming \(callId) connected=\(call.hasConnected)")
            endCallKitCall(uuid: call.uuid, reason: .remoteEnded, notifyJs: call.hasConnected)
        }
    }

    func endCallFromPluginRequest(callId: String) {
        let normalized = callId.lowercased()
        if NativeVoiceCallEngine.shared.activeCallId == normalized {
            NativeVoiceCallEngine.shared.endCall(reason: "plugin_end", syncServer: false)
        }
        guard let uuid = UUID(uuidString: normalized) else { return }
        endCallKitCall(uuid: uuid, reason: .remoteEnded, notifyJs: true)
    }

    /// CallKit owns incoming Accept/Decline on iOS (foreground + lock) — do not dismiss for in-app overlay.
    func reconcileForegroundIncomingUi() {}

    /// WebRTC connected — clear pending answer state. Do not call reportOutgoingCall on incoming UUIDs (CallKit crash).
    func reportCallConnected(callId: String) {
        let normalized = callId.lowercased()
        Self.noteCallDismissed(normalized)
        Self.clearLockScreenNativeAnswer(callId: normalized)
        endAnswerBackgroundSupport()
        clearPendingCallKitAnswer()
        cancelDismissRetries(callId: normalized)
        stopCallStatusWatch(callId: normalized)
    }

    private func markPendingCallKitAnswer(callId: String) {
        UserDefaults.standard.set(callId.lowercased(), forKey: Self.pendingAnswerCallIdKey)
    }

    private func clearPendingCallKitAnswer() {
        jsAnswerRetryGeneration = nil
        audioActivationFallbackGeneration = nil
        UserDefaults.standard.removeObject(forKey: Self.pendingAnswerCallIdKey)
        endAnswerBackgroundSupport()
    }

    /// CallKit activates audio after fulfill — if didActivate is delayed on lock screen, unstick WebRTC.
    private func scheduleCallKitAudioActivationFallback(callId: String) {
        let normalized = callId.lowercased()
        let generation = UUID()
        audioActivationFallbackGeneration = generation
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
            guard let self, self.audioActivationFallbackGeneration == generation else { return }
            guard UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased() == normalized else {
                return
            }
            guard NativeVoiceCallEngine.shared.awaitsCallKitAudioActivation else { return }
            print("[AiMediaTankVoipPushBridge] didActivate fallback — activating audio for \(normalized)")
            self.postVoiceTrace(callId: normalized, event: "callkit_audio_fallback")
            NativeVoiceCallEngine.shared.audioSessionActivated()
        }
    }

    private func startAnswerBackgroundSupport(callId: String) {
        endAnswerBackgroundSupport()
        let normalized = callId.lowercased()
        let generation = UUID()
        connectionWatchdogGeneration = generation

        answerBackgroundTask = UIApplication.shared.beginBackgroundTask(withName: "AiMediaTank WebRTC connect") {
            [weak self] in
            self?.endAnswerBackgroundSupport()
        }

        // CallKit shows in-call UI on answer before WebRTC is ready — end ghost calls if media never connects.
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.webrtcConnectWatchdogSeconds) { [weak self] in
            guard let self, self.connectionWatchdogGeneration == generation else { return }
            guard UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased() == normalized else {
                self.endAnswerBackgroundSupport()
                return
            }
            if NativeVoiceCallEngine.shared.isMediaConnected {
                self.endAnswerBackgroundSupport()
                return
            }
            if NativeVoiceCallEngine.shared.isActive {
                print("[AiMediaTankVoipPushBridge] WebRTC watchdog extended — native still connecting \(normalized)")
                self.startAnswerBackgroundSupport(callId: normalized)
                return
            }
            if !Self.canDeliverToWebView() {
                print("[AiMediaTankVoipPushBridge] WebRTC watchdog deferred — device locked \(normalized)")
                self.startAnswerBackgroundSupport(callId: normalized)
                return
            }
            print("[AiMediaTankVoipPushBridge] WebRTC watchdog — ending unanswered CallKit call \(normalized)")
            if let uuid = UUID(uuidString: normalized) {
                self.endCallKitCall(uuid: uuid, reason: .failed, notifyJs: true)
            }
            self.clearPendingCallKitAnswer()
        }
    }

    private func endAnswerBackgroundSupport() {
        connectionWatchdogGeneration = nil
        if answerBackgroundTask != .invalid {
            UIApplication.shared.endBackgroundTask(answerBackgroundTask)
            answerBackgroundTask = .invalid
        }
    }

    /// Re-deliver CallKit answer to JS when the WebView was not ready (lock-screen accept).
    func replayPendingCallKitAnswerIfNeeded() {
        guard let callId = UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey),
              !callId.isEmpty else { return }
        print("[AiMediaTankVoipPushBridge] replay pending CallKit answer for \(callId)")
        pendingJsAnswerCallId = callId.lowercased()
        pendingJsAnswerDeclineToken = UserDefaults.standard.string(forKey: Self.declineTokenKey(for: callId))
        deliverPendingCallKitAnswerToJs()
    }

    func ensureStarted() {
        let firstPushKitStart = pushRegistry == nil
        if firstPushKitStart {
            // Clear ghost CallKit sessions before PushKit delivers the next incoming push.
            recoverFromStaleCallState()
        }

        guard pushRegistry == nil else {
            replayCachedVoipTokenIfNeeded()
            syncCachedVoipTokenToServerIfNeeded()
            return
        }
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

        NotificationCenter.default.addObserver(
            forName: Notification.Name("AiMediaTankReportCallConnected"),
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self,
                  let callId = notification.userInfo?["callId"] as? String else { return }
            self.reportCallConnected(callId: callId)
        }

        NotificationCenter.default.addObserver(
            forName: Self.bridgeEndCallNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self,
                  let callId = notification.userInfo?["callId"] as? String else { return }
            self.endCallFromPluginRequest(callId: callId)
        }

        NotificationCenter.default.addObserver(
            forName: Self.jsIncomingCallNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.handleJsIncomingCallReport(notification)
        }

        NotificationCenter.default.addObserver(
            forName: UIApplication.protectedDataDidBecomeAvailableNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            print("[AiMediaTankVoipPushBridge] device unlocked — connect voice if pending")
            self?.prepareUnlockedRingingCallsIfNeeded()
            self?.syncLockScreenCallUiIfNeeded()
            self?.retryWebRtcConnectIfNeeded()
        }

        NotificationCenter.default.addObserver(
            forName: Self.storeNativePushCredentialsNotification,
            object: nil,
            queue: .main
        ) { notification in
            guard let userId = notification.userInfo?["userId"] as? String,
                  let registerKey = notification.userInfo?["registerKey"] as? String,
                  !userId.isEmpty, !registerKey.isEmpty else { return }
            UserDefaults.standard.set(userId, forKey: Self.nativePushUserIdKey)
            UserDefaults.standard.set(registerKey, forKey: Self.nativePushRegisterKeyKey)
            print("[AiMediaTankVoipPushBridge] stored native push credentials for \(userId)")
            self.syncCachedVoipTokenToServerIfNeeded()
        }

        replayPendingCallKitAnswerIfNeeded()
        replayCachedVoipTokenIfNeeded()
        syncCachedVoipTokenToServerIfNeeded()
    }

    /// Defer stale CallKit cleanup until foreground — never during VoIP cold wake before reportNewIncomingCall.
    func recoverStaleCallStateWhenIdle() {
        recoverFromStaleCallState()
    }

    private func syncCachedVoipTokenToServerIfNeeded() {
        guard let tokenHex = UserDefaults.standard.string(forKey: Self.voipTokenHexKey),
              !tokenHex.isEmpty else { return }
        syncVoipTokenToServer(tokenHex: tokenHex)
    }

    /// Register PushKit token with server without WKWebView (uses native register key from last sign-in).
    private func syncVoipTokenToServer(tokenHex: String) {
        let normalized = tokenHex.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else { return }
        if normalized == UserDefaults.standard.string(forKey: Self.voipTokenServerSyncedHexKey) {
            return
        }

        if let userId = UserDefaults.standard.string(forKey: Self.nativePushUserIdKey),
           let registerKey = UserDefaults.standard.string(forKey: Self.nativePushRegisterKeyKey),
           !userId.isEmpty, !registerKey.isEmpty,
           let url = URL(string: "\(voiceApiBaseURL())/api/push/voip-subscribe-native") {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: [
                "userId": userId,
                "registerKey": registerKey,
                "token": normalized,
                "platform": "ios",
            ])
            URLSession.shared.dataTask(with: request) { _, response, error in
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                if code == 200 {
                    UserDefaults.standard.set(normalized, forKey: Self.voipTokenServerSyncedHexKey)
                    print("[AiMediaTankVoipPushBridge] native voip token synced for \(userId)")
                } else {
                    print("[AiMediaTankVoipPushBridge] native voip token sync HTTP \(code) err=\(error?.localizedDescription ?? "none")")
                }
            }.resume()
            return
        }

        guard let url = URL(string: "\(voiceApiBaseURL())/api/push/voip-subscribe") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "token": normalized,
            "platform": "ios",
        ])
        if let cookies = HTTPCookieStorage.shared.cookies(for: url) {
            for (key, value) in HTTPCookie.requestHeaderFields(with: cookies) {
                request.setValue(value, forHTTPHeaderField: key)
            }
        }
        URLSession.shared.dataTask(with: request) { _, response, error in
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            print("[AiMediaTankVoipPushBridge] cookie voip token sync HTTP \(code) err=\(error?.localizedDescription ?? "none")")
        }.resume()
    }

    /// Re-register VoIP only after Apple invalidates the token — not on every foreground.
    func refreshPushKitRegistration() {
        guard incomingVoipPushInFlight == 0 else {
            print("[AiMediaTankVoipPushBridge] skip PushKit refresh — incoming VoIP push in flight")
            return
        }
        guard let registry = pushRegistry else {
            ensureStarted()
            return
        }
        registry.desiredPushTypes = []
        registry.desiredPushTypes = [.voIP]
        replayCachedVoipTokenIfNeeded()
    }

    /// Foreground: re-upload cached PushKit token without toggling desiredPushTypes (avoids missed wakes).
    func syncPushTokenOnForeground() {
        UserDefaults.standard.removeObject(forKey: Self.voipTokenServerSyncedHexKey)
        syncCachedVoipTokenToServerIfNeeded()
    }

    /// TestFlight / App Store updates keep UserDefaults — refresh PushKit + re-upload token when build changes.
    func migratePushKitAfterAppUpdateIfNeeded() {
        let buildLabel = Self.currentAppBuildLabel()
        let previous = UserDefaults.standard.string(forKey: Self.lastMigratedAppBuildKey)
        guard previous != buildLabel else { return }

        UserDefaults.standard.set(buildLabel, forKey: Self.lastMigratedAppBuildKey)
        UserDefaults.standard.removeObject(forKey: Self.voipTokenServerSyncedHexKey)
        print(
            "[AiMediaTankVoipPushBridge] app update \(previous ?? "fresh") → \(buildLabel) — force PushKit token refresh"
        )

        if pushRegistry != nil {
            refreshPushKitRegistration()
        }
        syncCachedVoipTokenToServerIfNeeded()
    }

    private static func currentAppBuildLabel() -> String {
        let short = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        return "\(short)(\(build))"
    }

    private func replayCachedVoipTokenIfNeeded() {
        guard let tokenHex = UserDefaults.standard.string(forKey: Self.voipTokenHexKey),
              !tokenHex.isEmpty,
              let tokenData = Self.dataFromHex(tokenHex) else { return }
        print("[AiMediaTankVoipPushBridge] replay cached VoIP token for late JS listeners")
        NotificationCenter.default.post(
            name: Self.voipTokenNotification,
            object: tokenData
        )
    }

    private static func dataFromHex(_ hex: String) -> Data? {
        let cleaned = hex.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard cleaned.count % 2 == 0 else { return nil }
        var data = Data(capacity: cleaned.count / 2)
        var index = cleaned.startIndex
        while index < cleaned.endIndex {
            let next = cleaned.index(index, offsetBy: 2)
            guard let byte = UInt8(cleaned[index..<next], radix: 16) else { return nil }
            data.append(byte)
            index = next
        }
        return data
    }

    static func noteIncomingCallReported(_ callId: String) {
        let normalized = callId.lowercased()
        var ids = UserDefaults.standard.stringArray(forKey: ringingCallIdsKey) ?? []
        if !ids.contains(normalized) {
            ids.append(normalized)
            UserDefaults.standard.set(ids, forKey: ringingCallIdsKey)
        }
        UserDefaults.standard.set(
            Date().timeIntervalSince1970,
            forKey: incomingReportedAtKeyPrefix + normalized
        )
    }

    private static func isWithinIncomingGracePeriod(callId: String) -> Bool {
        let normalized = callId.lowercased()
        let reportedAt = UserDefaults.standard.double(forKey: incomingReportedAtKeyPrefix + normalized)
        guard reportedAt > 0 else { return false }
        return Date().timeIntervalSince1970 - reportedAt < statusPollGraceSeconds
    }

    static func noteCallDismissed(_ callId: String) {
        let normalized = callId.lowercased()
        var ids = UserDefaults.standard.stringArray(forKey: ringingCallIdsKey) ?? []
        ids.removeAll { $0 == normalized }
        UserDefaults.standard.set(ids, forKey: ringingCallIdsKey)
        // Allow retry VoIP pushes to re-report CallKit if a ring was dismissed early.
        UserDefaults.standard.removeObject(forKey: incomingReportedAtKeyPrefix + normalized)
    }

    private static func hasCallKitIncomingRing(callId: String) -> Bool {
        let normalized = callId.lowercased()
        return CXCallObserver().calls.contains {
            !$0.hasEnded && !$0.isOutgoing && !$0.hasConnected
                && $0.uuid.uuidString.lowercased() == normalized
        }
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

    /// End a CallKit call (ringing or already answered) and notify JS to tear down WebRTC.
    private func endCallKitCall(uuid: UUID, reason: CXCallEndedReason = .remoteEnded, notifyJs: Bool = true) {
        let callId = uuid.uuidString.lowercased()
        if NativeVoiceCallEngine.shared.activeCallId == callId {
            NativeVoiceCallEngine.shared.endCall(reason: "callkit_end", syncServer: false)
        }
        let end = { [weak self] in
            guard let self = self else { return }
            self.provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
            let endCallAction = CXEndCallAction(call: uuid)
            self.callController.request(CXTransaction(action: endCallAction)) { error in
                if let error {
                    print("[AiMediaTankVoipPushBridge] CXEndCallAction failed for \(uuid): \(error.localizedDescription)")
                }
            }
            if notifyJs {
                NotificationCenter.default.post(
                    name: Self.callKitEndNotification,
                    object: nil,
                    userInfo: ["callId": callId]
                )
            }
            Self.noteCallDismissed(callId)
            if UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased() == callId {
                self.clearPendingCallKitAnswer()
            }
            self.cancelDismissRetries(callId: callId)
            self.stopCallStatusWatch(callId: callId)
            self.releaseAudioSession()
        }
        if Thread.isMainThread {
            end()
        } else {
            DispatchQueue.main.async(execute: end)
        }
    }

    func dismissRingingCall(uuid: UUID) {
        endCallKitCall(uuid: uuid, reason: .unanswered, notifyJs: false)
        NotificationCenter.default.post(
            name: Self.cancelPushNotification,
            object: nil,
            userInfo: ["callId": uuid.uuidString.lowercased()]
        )
    }

    func dismissAllRingingCalls(preferredCallId: String? = nil) {
        if let preferredCallId,
           let uuid = UUID(uuidString: preferredCallId.lowercased()) {
            endCallKitCall(uuid: uuid, reason: .remoteEnded, notifyJs: true)
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
                self.endCallKitCall(uuid: uuid, reason: .remoteEnded)
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

        endOrphanedBridgeCallsBeforeIncoming(exceptCallId: callId.uuidString)

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
        if (source == "status_poll" || source == "bridge_dismiss_request"),
           Self.isWithinIncomingGracePeriod(callId: normalized) {
            print("[AiMediaTankVoipPushBridge] defer \(source) dismiss — incoming grace \(normalized)")
            return
        }
        if Self.isCallCancelled(normalized) {
            if let uuid = UUID(uuidString: normalized) {
                endCallKitCall(uuid: uuid, reason: .remoteEnded, notifyJs: true)
            }
            return
        }
        reportCancelAck(callId: normalized, source: source)
        postVoiceTrace(callId: normalized, event: "callkit_dismiss", detail: ["source": source])
        Self.markCallCancelled(normalized)
        clearPendingCallKitAnswer()
        if let uuid = UUID(uuidString: normalized) {
            endCallKitCall(uuid: uuid, reason: .remoteEnded, notifyJs: true)
        }
        NotificationCenter.default.post(
            name: Self.cancelPushNotification,
            object: nil,
            userInfo: ["callId": normalized]
        )
        scheduleDismissRetries(for: normalized)
        // In-app overlay + WebRTC: JS must tear down even when CallKit was already dismissed.
        NotificationCenter.default.post(
            name: Self.callKitEndNotification,
            object: nil,
            userInfo: ["callId": normalized]
        )
        injectCallCancelToWebView(callId: normalized)
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

    private func postVoiceTrace(callId: String, event: String, detail: [String: Any] = [:]) {
        let normalized = callId.lowercased()
        let token = UserDefaults.standard.string(forKey: Self.declineTokenKey(for: normalized)) ?? ""
        guard !token.isEmpty, let url = URL(string: "\(voiceApiBaseURL())/api/chat/voice/native-trace") else { return }
        var body: [String: Any] = [
            "callId": normalized,
            "token": token,
            "source": "ios_bridge",
            "event": event,
        ]
        if !detail.isEmpty { body["detail"] = detail }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: request).resume()
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

    /// Foreground JS fallback when VoIP push did not report CallKit yet.
    private func handleJsIncomingCallReport(_ notification: Notification) {
        guard let userInfo = notification.userInfo,
              let callIdString = userInfo["callId"] as? String,
              let callId = UUID(uuidString: callIdString.lowercased()),
              let handle = userInfo["handle"] as? String,
              let displayName = userInfo["displayName"] as? String else { return }

        let normalizedCallId = callIdString.lowercased()
        if Self.isCallCancelled(normalizedCallId) { return }

        let handleTypeString = userInfo["handleType"] as? String ?? "generic"
        if let token = userInfo["declineToken"] as? String, !token.isEmpty {
            UserDefaults.standard.set(token, forKey: Self.declineTokenKey(for: normalizedCallId))
        }

        // VoIP push already reported CallKit; JS fallback only when push did not arrive (usually background).
        if Self.isForegroundActive() {
            let observer = CXCallObserver()
            let alreadyRinging = observer.calls.contains {
                !$0.hasEnded && $0.uuid.uuidString.lowercased() == normalizedCallId
            }
            if alreadyRinging {
                print("[AiMediaTankVoipPushBridge] JS incoming skipped on foreground — CallKit from VoIP \(normalizedCallId)")
                Self.noteIncomingCallReported(callIdString)
                return
            }
            print("[AiMediaTankVoipPushBridge] foreground JS fallback — VoIP not on screen yet \(normalizedCallId)")
        }

        reportIncomingToCallKit(
            callId: callId,
            handle: handle,
            displayName: displayName,
            handleType: handleType(from: handleTypeString),
            video: false
        ) { [weak self] reported in
            if reported {
                Self.noteIncomingCallReported(callIdString)
                NotificationCenter.default.post(
                    name: Notification.Name("AiMediaTankNoteIncomingCall"),
                    object: nil,
                    userInfo: ["callId": normalizedCallId]
                )
            }
        }
    }

    /// Accept on the server immediately from native code (no browser session required).
    private func postNativeCallKitAccept(callId: String) {
        let normalized = callId.lowercased()
        let token = UserDefaults.standard.string(forKey: Self.declineTokenKey(for: normalized)) ?? ""
        guard !token.isEmpty else {
            print("[AiMediaTankVoipPushBridge] accept skip — no decline token for \(normalized)")
            return
        }
        guard let url = URL(string: "\(voiceApiBaseURL())/api/chat/voice/native-callkit") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: [
            "action": "accept",
            "callId": normalized,
            "token": token,
        ])
        URLSession.shared.dataTask(with: request) { _, response, error in
            if let error {
                print("[AiMediaTankVoipPushBridge] native accept failed call=\(normalized): \(error.localizedDescription)")
                return
            }
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            print("[AiMediaTankVoipPushBridge] native accept HTTP \(code) call=\(normalized)")
        }.resume()
    }

    /// Re-post callAnswered to JS while the pending answer key is still set (WebView may load late).
    private func scheduleJsAnswerDeliveryRetries(callId: String) {
        let generation = UUID()
        jsAnswerRetryGeneration = generation
        let normalized = callId.lowercased()
        // WKWebView may stay frozen on lock screen for minutes — keep nudging JS until pending clears.
        let delays: [TimeInterval] = [
            1.0, 2.0, 4.0, 6.0, 10.0, 15.0, 25.0, 40.0, 55.0, 70.0,
            90.0, 120.0, 150.0, 180.0, 240.0, 300.0,
        ]
        for delay in delays {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self, self.jsAnswerRetryGeneration == generation else { return }
                guard UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased() == normalized else {
                    return
                }
                if Self.isLockScreenNativeAnswer(callId: normalized) {
                    self.syncLockScreenCallUiIfNeeded()
                    return
                }
                guard Self.canDeliverToWebView() else { return }
                self.pendingJsAnswerCallId = normalized
                self.pendingJsAnswerDeclineToken = UserDefaults.standard.string(
                    forKey: Self.declineTokenKey(for: normalized)
                )
                print("[AiMediaTankVoipPushBridge] retry CallKit answer delivery to JS \(normalized)")
                self.deliverPendingCallKitAnswerToJs()
            }
        }
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

        DispatchQueue.main.asyncAfter(deadline: .now() + Self.statusPollStartDelaySeconds) {
            guard self.statusWatchGeneration[normalized] == generation else { return }
            poll(attempt: 0)
        }
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
            // Only dismiss on explicit terminal statuses — `gone`/unknown must not end CallKit after one ring.
            let terminalStatuses: Set<String> = ["ended", "rejected", "missed"]
            if terminalStatuses.contains(status) {
                print("[AiMediaTankVoipPushBridge] status poll terminal \(status) for call \(callId)")
                self.postVoiceTrace(callId: callId, event: "status_poll_terminal", detail: ["status": status])
                completion(false)
                return
            }
            completion(true)
        }.resume()
    }

    // MARK: - PKPushRegistryDelegate

    func pushRegistry(_ registry: PKPushRegistry, didUpdate pushCredentials: PKPushCredentials, for type: PKPushType) {
        guard type == .voIP else { return }
        let tokenHex = pushCredentials.token.map { String(format: "%02x", $0) }.joined()
        let normalized = tokenHex.lowercased()
        let previous = UserDefaults.standard.string(forKey: Self.voipTokenHexKey)?.lowercased()
        UserDefaults.standard.set(normalized, forKey: Self.voipTokenHexKey)
        if previous != normalized {
            UserDefaults.standard.removeObject(forKey: Self.voipTokenServerSyncedHexKey)
        }
        syncVoipTokenToServer(tokenHex: normalized)
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

        incomingVoipPushInFlight += 1
        var completed = false
        let completeOnce: () -> Void = { [weak self] in
            guard !completed else { return }
            completed = true
            self?.incomingVoipPushInFlight = max(0, (self?.incomingVoipPushInFlight ?? 1) - 1)
            completion()
        }

        ensureStarted()

        let payloadDict = payload.dictionaryPayload

        if payloadString(payloadDict, key: "action") == "cancel" {
            if let cancelCallId = payloadString(payloadDict, key: "callId") {
                let normalizedCallId = cancelCallId.lowercased()
                print("[AiMediaTankVoipPushBridge] cancel push RECEIVED for call \(normalizedCallId) payloadKeys=\(payloadDict.keys.map { String(describing: $0) }.joined(separator: ","))")
                performCancelDismiss(callId: normalizedCallId, source: "voip_cancel_push")
            } else {
                print("[AiMediaTankVoipPushBridge] cancel push MISSING callId payloadKeys=\(payloadDict.keys.map { String(describing: $0) }.joined(separator: ","))")
            }
            completeOnce()
            return
        }

        guard let callIdString = payloadString(payloadDict, key: "callId"),
              let handle = payloadString(payloadDict, key: "handle"),
              let displayName = payloadString(payloadDict, key: "displayName") else {
            print("[AiMediaTankVoipPushBridge] ignored VoIP push (not cancel/incoming) keys=\(payloadDict.keys.map { String(describing: $0) }.joined(separator: ","))")
            completeOnce()
            return
        }
        guard let callId = UUID(uuidString: callIdString.lowercased()) else {
            print("[AiMediaTankVoipPushBridge] ignored VoIP push — invalid callId UUID \(callIdString)")
            completeOnce()
            return
        }

        prepareForNewIncomingCall(callId: callIdString)
        let normalizedCallId = callIdString.lowercased()
        if let token = declineToken(from: payloadDict) {
            UserDefaults.standard.set(token, forKey: Self.declineTokenKey(for: normalizedCallId))
        }
        postVoiceTrace(callId: callIdString, event: "voip_push_received")

        if Self.isCallCancelled(callIdString) {
            print("[AiMediaTankVoipPushBridge] ignored incoming push — call already cancelled \(normalizedCallId)")
            completeOnce()
            return
        }

        if isIncomingCallAlreadyHandled(callId: normalizedCallId) {
            print("[AiMediaTankVoipPushBridge] ignored incoming push — call already answered \(normalizedCallId)")
            postVoiceTrace(callId: normalizedCallId, event: "grace_skip_answered")
            completeOnce()
            return
        }

        if Self.isWithinIncomingGracePeriod(callId: normalizedCallId) {
            if Self.hasCallKitIncomingRing(callId: normalizedCallId) {
                print("[AiMediaTankVoipPushBridge] duplicate incoming VoIP push for active ring \(normalizedCallId)")
                postVoiceTrace(callId: normalizedCallId, event: "grace_skip_active_ring")
                if let token = declineToken(from: payloadDict) {
                    UserDefaults.standard.set(token, forKey: Self.declineTokenKey(for: normalizedCallId))
                }
                var info = userInfo(from: payloadDict)
                info["reportedToCallKit"] = true
                NotificationCenter.default.post(
                    name: Self.incomingPushNotification,
                    object: nil,
                    userInfo: info
                )
                NotificationCenter.default.post(name: Self.incomingPushDoneNotification, object: nil)
                completeOnce()
                return
            }
            print("[AiMediaTankVoipPushBridge] grace period stale — re-reporting CallKit for \(normalizedCallId)")
            postVoiceTrace(callId: normalizedCallId, event: "grace_stale_retry")
            UserDefaults.standard.removeObject(forKey: Self.incomingReportedAtKeyPrefix + normalizedCallId)
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

        func forwardToPlugin(reportedToCallKit: Bool) {
            var info = self.userInfo(from: payloadDict)
            info["reportedToCallKit"] = reportedToCallKit
            if reportedToCallKit {
                info["callKitOnly"] = true
                Self.noteIncomingCallReported(callIdString)
            }
            if let token = self.declineToken(from: payloadDict) {
                UserDefaults.standard.set(token, forKey: Self.declineTokenKey(for: normalizedCallId))
                self.startCallStatusWatch(callId: normalizedCallId, token: token)
            }
            NotificationCenter.default.post(
                name: Self.incomingPushNotification,
                object: nil,
                userInfo: info
            )
        }

        // Apple requires reportNewIncomingCall for every VoIP push — CallKit is the only incoming UI on iOS.
        print("[AiMediaTankVoipPushBridge] VoIP push — bridge reporting incoming \(normalizedCallId)")
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
            if reported {
                self.postVoiceTrace(callId: normalizedCallId, event: "callkit_report_ok")
                completeOnce()
            } else {
                self.postVoiceTrace(callId: normalizedCallId, event: "callkit_report_fail")
            }
            forwardToPlugin(reportedToCallKit: reported)
            if !reported {
                completeOnce()
            }
        }
    }

    func pushRegistry(_ registry: PKPushRegistry, didInvalidatePushTokenFor type: PKPushType) {
        print("[AiMediaTankVoipPushBridge] Push token invalidated for type: \(type)")
        guard type == .voIP else { return }
        UserDefaults.standard.removeObject(forKey: Self.voipTokenHexKey)
        UserDefaults.standard.removeObject(forKey: Self.voipTokenServerSyncedHexKey)
        DispatchQueue.main.async { [weak self] in
            self?.refreshPushKitRegistration()
        }
    }

    // MARK: - CXProviderDelegate

    func providerDidReset(_ provider: CXProvider) {
        print("[AiMediaTankVoipPushBridge] providerDidReset — clearing stale VoIP call state")
        statusWatchGeneration.keys.forEach { stopCallStatusWatch(callId: $0) }
        dismissRetryGeneration.removeAll()
        clearPendingCallKitAnswer()
        releaseAudioSession()
        dismissAllRingingCalls()
        UserDefaults.standard.removeObject(forKey: Self.ringingCallIdsKey)
    }

    /// Push in-app call state after unlock — never foreground WebView during CallKit (#1→#3).
    func syncLockScreenCallUiIfNeeded() {
        guard Self.canDeliverToWebView() else { return }
        NativeVoiceCallEngine.shared.syncUiIfConnected()

        let callId = UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased()
            ?? NativeVoiceCallEngine.shared.activeCallId?.lowercased()
        guard let callId, !callId.isEmpty else { return }
        guard Self.isLockScreenNativeAnswer(callId: callId)
            || NativeVoiceCallEngine.shared.activeCallId?.lowercased() == callId else { return }

        let token = UserDefaults.standard.string(forKey: Self.declineTokenKey(for: callId))
        pendingJsAnswerCallId = callId
        pendingJsAnswerDeclineToken = token
        deliverLockScreenCallUiToJs(callId: callId, declineToken: token)
    }

    private func deliverLockScreenCallUiToJs(callId: String, declineToken: String?) {
        guard Self.canDeliverToWebView() else { return }
        var userInfo: [String: Any] = [
            "callId": callId,
            "useSessionWebRtc": false,
            "nativeWebRtc": true,
        ]
        if let declineToken, !declineToken.isEmpty {
            userInfo["declineToken"] = declineToken
        }
        print("[AiMediaTankVoipPushBridge] deliver lock-screen call UI to JS \(callId)")
        NotificationCenter.default.post(
            name: Self.callKitAnswerNotification,
            object: nil,
            userInfo: userInfo
        )
        injectCallKitAnswerToWebView(
            callId: callId,
            declineToken: declineToken,
            useSessionWebRtc: false,
            nativeWebRtc: true
        )
    }

    private func deliverPendingCallKitAnswerToJs() {
        let callId = pendingJsAnswerCallId
            ?? UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased()
        guard let callId, !callId.isEmpty else { return }

        if Self.canDeliverToWebView() {
            let token = pendingJsAnswerDeclineToken
                ?? UserDefaults.standard.string(forKey: Self.declineTokenKey(for: callId))
            deliverLockScreenCallUiToJs(callId: callId, declineToken: token)
            return
        }

        pendingJsAnswerCallId = callId
        pendingJsAnswerDeclineToken = pendingJsAnswerDeclineToken
            ?? UserDefaults.standard.string(forKey: Self.declineTokenKey(for: callId))
        print("[AiMediaTankVoipPushBridge] defer native call UI — WebView not ready \(callId)")
    }

    /// Step 1→2: user unlocked — cache caller for CallKit ring; do not show in-app incoming UI (#1).
    func prepareUnlockedRingingCallsIfNeeded() {
        guard Self.isDeviceUnlockedForVoice() else { return }
        guard !hasPendingCallKitAnswer() else { return }

        let observer = CXCallObserver()
        let ringing = observer.calls.filter { !$0.hasEnded && !$0.isOutgoing && !$0.hasConnected }
        guard !ringing.isEmpty else { return }

        for call in ringing {
            let callId = call.uuid.uuidString.lowercased()
            var userInfo: [String: Any] = ["callId": callId, "callKitOnly": true]
            if let token = UserDefaults.standard.string(forKey: Self.declineTokenKey(for: callId)) {
                userInfo["declineToken"] = token
            }
            print("[AiMediaTankVoipPushBridge] prepare unlocked incoming (CallKit only) \(callId)")
            NotificationCenter.default.post(
                name: Self.prepareUnlockedIncomingNotification,
                object: nil,
                userInfo: userInfo
            )
        }
    }

    /// Direct WKWebView inject — Capacitor events may not run while the phone is locked.
    private func injectCallKitAnswerToWebView(
        callId: String,
        declineToken: String?,
        useSessionWebRtc: Bool = false,
        nativeWebRtc: Bool = false
    ) {
        guard Self.canDeliverToWebView() else { return }
        guard let bridge = Self.findBridgeViewController(), let webView = bridge.webView else {
            print("[AiMediaTankVoipPushBridge] WebView inject skipped — no bridge for \(callId)")
            return
        }
        let tokenJs: String
        if let declineToken, !declineToken.isEmpty {
            let escaped = declineToken
                .replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "'", with: "\\'")
            tokenJs = ", declineToken: '\(escaped)'"
        } else {
            tokenJs = ""
        }
        let sessionJs = useSessionWebRtc ? ", useSessionWebRtc: true" : ""
        let nativeJs = nativeWebRtc ? ", nativeWebRtc: true" : ""
        let js = """
        (function(){
          try {
            window.dispatchEvent(new CustomEvent('aimediatank-callkit-answer', {
              detail: { callId: '\(callId)'\(tokenJs)\(sessionJs)\(nativeJs) }
            }));
          } catch (e) {}
        })();
        """
        let inject = {
            webView.evaluateJavaScript(js) { _, error in
                if let error {
                    print("[AiMediaTankVoipPushBridge] WebView inject failed \(callId): \(error.localizedDescription)")
                } else {
                    print("[AiMediaTankVoipPushBridge] WebView inject ok \(callId)")
                }
            }
        }
        if Thread.isMainThread {
            inject()
        } else {
            DispatchQueue.main.async(execute: inject)
        }
    }

    private func injectCallCancelToWebView(callId: String) {
        guard Self.canDeliverToWebView() else { return }
        guard let bridge = Self.findBridgeViewController(), let webView = bridge.webView else { return }
        let normalized = callId.lowercased()
        let js = """
        (function(){
          try {
            window.dispatchEvent(new CustomEvent('aimediatank-callkit-end', {
              detail: { callId: '\(normalized)' }
            }));
          } catch (e) {}
        })();
        """
        let inject = {
            webView.evaluateJavaScript(js) { _, error in
                if let error {
                    print("[AiMediaTankVoipPushBridge] cancel inject failed \(normalized): \(error.localizedDescription)")
                }
            }
        }
        if Thread.isMainThread {
            inject()
        } else {
            DispatchQueue.main.async(execute: inject)
        }
    }

    /// Notify server when user ends via CallKit so the remote peer clears UI immediately.
    private func syncCallEndToServer(callId: String) {
        let normalized = callId.lowercased()
        guard let token = UserDefaults.standard.string(forKey: Self.declineTokenKey(for: normalized)),
              !token.isEmpty else {
            print("[AiMediaTankVoipPushBridge] skip end sync — no token \(normalized)")
            return
        }
        guard let url = URL(string: "\(voiceApiBaseURL())/api/chat/voice/native-callkit") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: Any] = ["action": "end", "callId": normalized, "token": token]
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: request) { _, _, error in
            if let error {
                print("[AiMediaTankVoipPushBridge] end sync failed \(normalized): \(error.localizedDescription)")
            } else {
                print("[AiMediaTankVoipPushBridge] end synced \(normalized)")
            }
        }.resume()
    }

    private static func findBridgeViewController() -> CAPBridgeViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        for scene in scenes {
            for window in scene.windows {
                if let bridge = findBridge(in: window.rootViewController) {
                    return bridge
                }
            }
        }
        return nil
    }

    private static func findBridge(in viewController: UIViewController?) -> CAPBridgeViewController? {
        guard let viewController else { return nil }
        if let bridge = viewController as? CAPBridgeViewController {
            return bridge
        }
        for child in viewController.children {
            if let bridge = findBridge(in: child) {
                return bridge
            }
        }
        if let presented = viewController.presentedViewController,
           let bridge = findBridge(in: presented) {
            return bridge
        }
        return nil
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        let callId = action.callUUID.uuidString.lowercased()
        configureAudioSession()
        cancelDismissRetries(callId: callId)
        markPendingCallKitAnswer(callId: callId)
        // Keep status watch running after answer so caller hangup/end dismisses CallKit promptly.
        startAnswerBackgroundSupport(callId: callId)
        postNativeCallKitAccept(callId: callId)
        postVoiceTrace(callId: callId, event: "callkit_answer")
        let token = UserDefaults.standard.string(forKey: Self.declineTokenKey(for: callId)) ?? ""
        if !token.isEmpty {
            // Always native WebRTC for CallKit Accept — WKWebView RTCPeerConnection conflicts with CallKit audio (lock + in-app).
            Self.markLockScreenNativeAnswer(callId: callId)
            print("[AiMediaTankVoipPushBridge] CallKit Accept — native WebRTC \(callId)")
            NativeVoiceCallEngine.shared.prepareAnswer(
                callId: callId,
                token: token,
                baseURL: voiceApiBaseURL()
            )
            scheduleCallKitAudioActivationFallback(callId: callId)
        } else {
            print("[AiMediaTankVoipPushBridge] native WebRTC skipped — no decline token \(callId)")
        }
        pendingJsAnswerCallId = callId
        pendingJsAnswerDeclineToken = token.isEmpty ? nil : token
        scheduleJsAnswerDeliveryRetries(callId: callId)
        if Self.canDeliverToWebView() {
            deliverLockScreenCallUiToJs(callId: callId, declineToken: token.isEmpty ? nil : token)
        }
        // Fulfill after audio session is configured — CallKit then calls didActivate for WebRTC.
        action.fulfill()
    }

    /// Unlock → retry JS WebRTC if CallKit answer is still pending; otherwise native on lock screen.
    func retryWebRtcConnectIfNeeded() {
        prepareUnlockedRingingCallsIfNeeded()
        guard hasPendingCallKitAnswer() else { return }
        guard let callId = UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey) else { return }
        let token = UserDefaults.standard.string(forKey: Self.declineTokenKey(for: callId)) ?? ""
        guard !token.isEmpty else { return }
        if Self.isLockScreenNativeAnswer(callId: callId) {
            if Self.canDeliverToWebView() {
                print("[AiMediaTankVoipPushBridge] unlock — sync native call UI \(callId)")
                syncLockScreenCallUiIfNeeded()
            } else {
                print("[AiMediaTankVoipPushBridge] retry native WebRTC connect while locked \(callId)")
                NativeVoiceCallEngine.shared.prepareAnswer(
                    callId: callId,
                    token: token,
                    baseURL: voiceApiBaseURL()
                )
            }
            return
        }
        print("[AiMediaTankVoipPushBridge] retry native WebRTC connect \(callId)")
        NativeVoiceCallEngine.shared.prepareAnswer(
            callId: callId,
            token: token,
            baseURL: voiceApiBaseURL()
        )
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let callId = action.callUUID.uuidString.lowercased()
        audioActivationFallbackGeneration = nil
        Self.clearLockScreenNativeAnswer(callId: callId)
        if NativeVoiceCallEngine.shared.activeCallId == callId {
            NativeVoiceCallEngine.shared.endCall(reason: "callkit_end", syncServer: false)
        }
        syncCallEndToServer(callId: callId)
        injectCallCancelToWebView(callId: callId)
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
        releaseAudioSession()
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
        audioActivationFallbackGeneration = nil
        configureAudioSession()
        NativeVoiceCallEngine.shared.audioSessionActivated()
        if let callId = UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey) {
            postVoiceTrace(callId: callId, event: "callkit_audio_activated")
        }
        deliverPendingCallKitAnswerToJs()
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        NativeVoiceCallEngine.shared.audioSessionDeactivated()
        releaseAudioSession()
    }
}

// MARK: - NativeVoiceCallEngineDelegate

extension AiMediaTankVoipPushBridge: NativeVoiceCallEngineDelegate {
    func nativeVoiceCallEngineDidConnect(callId: String, caller: [String: Any]?) {
        print("[AiMediaTankVoipPushBridge] native WebRTC connected \(callId)")
        syncLockScreenCallUiIfNeeded()
        reportCallConnected(callId: callId)
    }

    func nativeVoiceCallEngineDidFail(callId: String, error: String) {
        print("[AiMediaTankVoipPushBridge] native WebRTC failed \(callId): \(error)")
        postVoiceTrace(callId: callId, event: "native_webrtc_failed", detail: ["error": error])
        print("[AiMediaTankVoipPushBridge] native WebRTC failed — not falling back to JS WebRTC \(callId)")
        Self.clearLockScreenNativeAnswer(callId: callId)
        if let uuid = UUID(uuidString: callId) {
            endCallKitCall(uuid: uuid, reason: .failed, notifyJs: true)
        } else {
            clearPendingCallKitAnswer()
        }
    }

    func nativeVoiceCallEngineDidEnd(callId: String) {
        print("[AiMediaTankVoipPushBridge] native WebRTC ended \(callId)")
    }
}
