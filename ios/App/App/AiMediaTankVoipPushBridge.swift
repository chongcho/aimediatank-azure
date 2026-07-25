import AVFoundation
import CallKit
import Capacitor
import Foundation
import PushKit
import UIKit
import WebKit
import WebRTC

/// App-target VoIP + CallKit handler. Single CXProvider for all incoming rings (PushKit + JS fallback).
/// PushKit, reportNewIncomingCall, answer/decline/cancel, and audio session live here only.
final class AiMediaTankVoipPushBridge: NSObject, PKPushRegistryDelegate, CXProviderDelegate, AVSpeechSynthesizerDelegate {
    static let shared = AiMediaTankVoipPushBridge()

    static let incomingPushNotification = Notification.Name("AiMediaTankVoipIncomingPush")
    static let startRingAnnouncementNotification = Notification.Name("AiMediaTankStartRingAnnouncement")
    static let stopRingAnnouncementNotification = Notification.Name("AiMediaTankStopRingAnnouncement")
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

    private static func callHasVideoKey(for callId: String) -> String {
        "AiMediaTank.callHasVideo.\(callId.lowercased())"
    }

    private static func noteCallHasVideo(_ callId: String, hasVideo: Bool) {
        let key = callHasVideoKey(for: callId)
        if hasVideo {
            UserDefaults.standard.set(true, forKey: key)
        } else {
            UserDefaults.standard.removeObject(forKey: key)
        }
    }

    private static func callHasVideo(_ callId: String) -> Bool {
        UserDefaults.standard.bool(forKey: callHasVideoKey(for: callId))
    }

    private static func clearCallHasVideo(_ callId: String) {
        UserDefaults.standard.removeObject(forKey: callHasVideoKey(for: callId))
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
    /// Prevents duplicate reportCall/CXEndCallAction when JS echoes end back into the plugin.
    private var endedCallKitCallIds = Set<String>()
    /// Lock-screen spoken ring ("Call from Name") — CallKit ringtoneSound is silent.wav.
    private let ringSpeech: AVSpeechSynthesizer = {
        let synth = AVSpeechSynthesizer()
        // Keep TTS off CallKit's shared session so CallKit ringtone does not kill the loop after one play.
        if #available(iOS 13.0, *) {
            synth.usesApplicationAudioSession = false
        }
        return synth
    }()
    private var ringAnnouncementActive = false
    private var ringAnnouncementGeneration = 0
    private var ringAnnouncementText = ""
    private var ringAnnouncementLang: String?
    private var ringAnnouncementLoopWork: DispatchWorkItem?
    /// Opaque call-colored cover above the WebView (WebView stays visible and paints underneath).
    private weak var acceptCoverView: UIView?
    private var acceptCoverPollWork: DispatchWorkItem?
    private var acceptCoverActive = false
    private static let acceptCoverBg = UIColor(red: 0.10, green: 0.07, blue: 0.04, alpha: 1)

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

    /// Cover the feed instantly on Accept. WebView keeps painting call UI underneath — no hide/black flash.
    private func beginAcceptCover() {
        let begin = { [weak self] in
            guard let self else { return }
            self.acceptCoverActive = true
            let bg = Self.acceptCoverBg
            guard let bridge = Self.findBridgeViewController() else { return }
            bridge.view.backgroundColor = bg
            bridge.webView?.backgroundColor = bg
            bridge.webView?.scrollView.backgroundColor = bg
            bridge.view.window?.backgroundColor = bg

            if self.acceptCoverView == nil {
                let cover = UIView(frame: bridge.view.bounds)
                cover.autoresizingMask = [.flexibleWidth, .flexibleHeight]
                cover.backgroundColor = bg
                cover.isUserInteractionEnabled = false
                cover.tag = 0xA11C07
                if let webView = bridge.webView {
                    bridge.view.insertSubview(cover, aboveSubview: webView)
                } else {
                    bridge.view.addSubview(cover)
                }
                self.acceptCoverView = cover
            } else {
                self.acceptCoverView?.backgroundColor = bg
                self.acceptCoverView?.isHidden = false
            }
            self.scheduleAcceptCoverReadyPoll(attempt: 0)
            print("[AiMediaTankVoipPushBridge] begin accept cover")
        }
        if Thread.isMainThread {
            begin()
        } else {
            DispatchQueue.main.async(execute: begin)
        }
    }

    private func endAcceptCover(reason: String) {
        let end = { [weak self] in
            guard let self else { return }
            guard self.acceptCoverActive || self.acceptCoverView != nil else { return }
            self.acceptCoverActive = false
            self.acceptCoverPollWork?.cancel()
            self.acceptCoverPollWork = nil
            self.acceptCoverView?.removeFromSuperview()
            self.acceptCoverView = nil
            // Native WebRTC owns video — keep the Metal overlay; only leave room for JS controls.
            // Never create an empty overlay on the JS WebRTC path (covers black PiP / no frames).
            if reason == "call_ui_ready", NativeVoiceCallEngine.shared.shouldShowVideoOverlay {
                NativeVoiceCallEngine.shared.layoutVideoOverlayForJsControls()
            }
            print("[AiMediaTankVoipPushBridge] end accept cover (\(reason))")
        }
        if Thread.isMainThread {
            end()
        } else {
            DispatchQueue.main.async(execute: end)
        }
    }

    private func scheduleAcceptCoverReadyPoll(attempt: Int) {
        guard acceptCoverActive, attempt < 60 else {
            if attempt >= 60 { endAcceptCover(reason: "timeout") }
            return
        }
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.acceptCoverActive else { return }
            guard let webView = Self.findBridgeViewController()?.webView else {
                self.scheduleAcceptCoverReadyPoll(attempt: attempt + 1)
                return
            }
            webView.evaluateJavaScript(
                "document.documentElement.getAttribute('data-amt-call-active')"
            ) { [weak self] result, _ in
                guard let self, self.acceptCoverActive else { return }
                if (result as? String) == "1" {
                    self.endAcceptCover(reason: "call_ui_ready")
                    return
                }
                self.scheduleAcceptCoverReadyPoll(attempt: attempt + 1)
            }
        }
        acceptCoverPollWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.05, execute: work)
    }

    private override init() {
        let configuration = CXProviderConfiguration(localizedName: "AiMediaTank")
        // Required for CallKit to label video calls as Video (not "AiMediaTank Audio").
        // Per-call CXCallUpdate.hasVideo still distinguishes audio vs video ringing/in-call.
        configuration.supportsVideo = true
        configuration.maximumCallGroups = 1
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic, .phoneNumber, .emailAddress]
        configuration.includesCallsInRecents = true
        // Silent CallKit tone — spoken "Call from {name}" is played by AVSpeechSynthesizer.
        configuration.ringtoneSound = "silent.wav"
        // Do not set iconTemplateImageData here — a full-size AppIcon PNG can crash CallKit.
        provider = CXProvider(configuration: configuration)
        super.init()
        provider.setDelegate(self, queue: nil)
        ringSpeech.delegate = self
        NativeVoiceCallEngine.shared.delegate = self
        RTCAudioSession.sharedInstance().useManualAudio = true
        installInAppRingAnnouncementObservers()
        installPrefetchVideoHandoffObserver()
    }

    /// Push may omit video=; when the offer has m=video, mark the call and hand unlocked Accept to JS.
    private func installPrefetchVideoHandoffObserver() {
        NotificationCenter.default.addObserver(
            forName: Notification.Name("AiMediaTankPrefetchOfferHasVideo"),
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self else { return }
            guard let callId = (notification.userInfo?["callId"] as? String)?.lowercased(), !callId.isEmpty else { return }
            Self.noteCallHasVideo(callId, hasVideo: true)
            reportCallKitHasVideo(callId: callId)

            // Already accepted on native thinking audio-only, still unlocked → switch to JS WebRTC.
            guard Self.canDeliverToWebView() else { return }
            guard UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased() == callId else { return }
            guard Self.isLockScreenNativeAnswer(callId: callId) else { return }
            guard !NativeVoiceCallEngine.shared.isMediaConnected else { return }

            print("[AiMediaTankVoipPushBridge] offer has video — handoff unlocked Accept to JS \(callId)")
            Self.clearLockScreenNativeAnswer(callId: callId)
            NativeVoiceCallEngine.shared.cancelAnswerForJsHandoff(callId: callId)
            let token = UserDefaults.standard.string(forKey: Self.declineTokenKey(for: callId))
            deliverLockScreenCallUiToJs(
                callId: callId,
                declineToken: token,
                useSessionWebRtc: true,
                nativeWebRtc: false
            )
        }
    }

    private func installInAppRingAnnouncementObservers() {
        NotificationCenter.default.addObserver(
            forName: Self.startRingAnnouncementNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            guard let self = self else { return }
            let text = (notification.userInfo?["text"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !text.isEmpty else { return }
            let lang = notification.userInfo?["lang"] as? String
            self.startInAppRingAnnouncement(text: text, lang: lang)
        }
        NotificationCenter.default.addObserver(
            forName: Self.stopRingAnnouncementNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.stopCallKitRingAnnouncement()
        }
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

    /// CallKit reset terminates every call — tear down native WebRTC and always release audio.
    private func tearDownNativeVoiceAfterCallKitReset() {
        if NativeVoiceCallEngine.shared.isActive
            || NativeVoiceCallEngine.shared.isMediaConnected
            || NativeVoiceCallEngine.shared.activeCallId != nil {
            NativeVoiceCallEngine.shared.audioSessionDeactivated()
            NativeVoiceCallEngine.shared.endCall(reason: "callkit_provider_reset", syncServer: false)
        }
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
        guard let uuid = UUID(uuidString: normalized) else { return }
        // End CallKit first; endCallKitCall tears down native WebRTC when activeCallId matches.
        endCallKitCall(uuid: uuid, reason: .remoteEnded, notifyJs: true)
    }

    /// CallKit owns incoming Accept/Decline on iOS (foreground + lock) — do not dismiss for in-app overlay.
    func reconcileForegroundIncomingUi() {}

    /// WebRTC connected — clear pending answer state. Do not call reportOutgoingCall on incoming UUIDs (CallKit crash).
    func reportCallConnected(callId: String) {
        let normalized = callId.lowercased()
        reportCallKitHasVideo(callId: normalized)
        Self.noteCallDismissed(normalized)
        Self.clearLockScreenNativeAnswer(callId: normalized)
        endAnswerBackgroundSupport()
        clearPendingCallKitAnswer()
        cancelDismissRetries(callId: normalized)
        stopCallStatusWatch(callId: normalized)
    }

    /// Keep CallKit subtitle/icon in sync with video vs audio for this UUID.
    private func reportCallKitHasVideo(callId: String) {
        guard let uuid = UUID(uuidString: callId) else { return }
        let update = CXCallUpdate()
        update.hasVideo = Self.callHasVideo(callId)
        provider.reportCall(with: uuid, updated: update)
        print("[AiMediaTankVoipPushBridge] CallKit hasVideo=\(update.hasVideo) \(callId.lowercased())")
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

    /// CallKit activates audio after fulfill — never fake didActivate; WebRTC mic requires the real session.
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
            print("[AiMediaTankVoipPushBridge] still awaiting CallKit didActivate for \(normalized)")
            self.postVoiceTrace(callId: normalized, event: "callkit_audio_awaiting_did_activate")
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
        if !hasActiveCallKitCall() && !hasPendingCallKitAnswer() {
            if NativeVoiceCallEngine.shared.isActive || NativeVoiceCallEngine.shared.isMediaConnected {
                print("[AiMediaTankVoipPushBridge] stale recovery — native WebRTC without CallKit call")
                NativeVoiceCallEngine.shared.endCall(reason: "stale_recovery", syncServer: false)
            }
        }
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
        endedCallKitCallIds.remove(normalized)
        Self.clearCallCancelled(normalized)
        cancelDismissRetries(except: normalized)
        stopStatusWatches(except: normalized)
        // Do not dismiss CallKit calls synchronously during PushKit — iOS can crash/reject.
    }

    /// End a CallKit call (ringing or already answered) and notify JS to tear down WebRTC.
    private func endCallKitCall(uuid: UUID, reason: CXCallEndedReason = .remoteEnded, notifyJs: Bool = true) {
        let callId = uuid.uuidString.lowercased()
        let end = { [weak self] in
            guard let self = self else { return }
            self.stopCallKitRingAnnouncement()
            NativeVoiceCallEngine.shared.clearPrefetch(callId: callId)
            Self.clearCallHasVideo(callId)
            self.endAcceptCover(reason: "call_ended")
            let observer = CXCallObserver()
            let stillOnCallKit = observer.calls.contains { $0.uuid == uuid && !$0.hasEnded }
            let alreadyMarked = self.endedCallKitCallIds.contains(callId)

            // Critical: if CallKit still shows the call, always re-end — do not skip because we
            // already marked it. Prior CXEndCallAction-only attempts could fail once and then
            // scheduleDismissRetries became no-ops (stuck lock-screen UI after caller hangup).
            if stillOnCallKit || !alreadyMarked {
                self.endedCallKitCallIds.insert(callId)
                if NativeVoiceCallEngine.shared.activeCallId == callId {
                    NativeVoiceCallEngine.shared.endCall(reason: "callkit_end", syncServer: false)
                }
                // Remote hangup / cancel: reportCall is the correct provider API.
                // CXEndCallAction alone often fails to clear lock-screen UI from a PushKit wake.
                self.provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
                print("[AiMediaTankVoipPushBridge] reportCall ended \(callId) reason=\(reason.rawValue) stillOnCallKit=\(stillOnCallKit)")
            }

            if notifyJs, !alreadyMarked {
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
            // Only stop dismiss retries once CallKit no longer shows the call — otherwise
            // the first end attempt would cancel scheduleDismissRetries and leave UI stuck.
            let stillVisible = CXCallObserver().calls.contains { $0.uuid == uuid && !$0.hasEnded }
            if !stillVisible {
                self.cancelDismissRetries(callId: callId)
            }
            self.stopCallStatusWatch(callId: callId)
            // Audio session is released in provider(_:didDeactivate:) — do not setActive(false) here.
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

        for delay in [0.5, 2.0, 5.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                guard let self = self,
                      self.dismissRetryGeneration[normalized] == generation,
                      let uuid = UUID(uuidString: normalized) else { return }
                let stillOnCallKit = CXCallObserver().calls.contains { $0.uuid == uuid && !$0.hasEnded }
                guard stillOnCallKit else { return }
                print("[AiMediaTankVoipPushBridge] dismiss retry — CallKit still showing \(normalized)")
                // Allow endCallKitCall to re-report even if previously marked.
                self.endedCallKitCallIds.remove(normalized)
                self.endCallKitCall(uuid: uuid, reason: .remoteEnded, notifyJs: false)
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
        // Video calls must set hasVideo so CallKit shows Video (not "AiMediaTank Audio").
        update.hasVideo = video
        if video {
            print("[AiMediaTankVoipPushBridge] incoming CallKit video \(callId.uuidString.lowercased())")
        }

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

    /// Apple kills the process (and eventually stops VoIP delivery) if a VoIP push completes
    /// without `reportNewIncomingCall` or an existing CallKit call.
    ///
    /// - Cancel while that call UUID is on CallKit: end **that** UUID only.
    /// - Otherwise wait briefly for an in-flight incoming report, then end it or use synthetic.
    /// - Never invent a *new* UUID while another CallKit call is live — that flashes
    ///   Decline / End & Accept over the answered call (lock-screen Accept regression).
    private func fulfillVoipPushReportingRequirement(
        endingCallId: UUID? = nil,
        completion: @escaping () -> Void
    ) {
        if let endingCallId {
            let normalized = endingCallId.uuidString.lowercased()
            let endExistingOrFulfill = { [weak self] in
                guard let self else {
                    completion()
                    return
                }
                let onCallKit = CXCallObserver().calls.contains { $0.uuid == endingCallId && !$0.hasEnded }
                if onCallKit {
                    print("[AiMediaTankVoipPushBridge] fulfill VoIP push via existing CallKit call \(normalized)")
                    self.endCallKitCall(uuid: endingCallId, reason: .remoteEnded, notifyJs: false)
                    completion()
                    return
                }
                print("[AiMediaTankVoipPushBridge] fulfill VoIP push — \(normalized) not on CallKit")
                self.reportPushKitCompliantIncoming(preferredExistingUUID: nil, completion: completion)
            }

            if CXCallObserver().calls.contains(where: { $0.uuid == endingCallId && !$0.hasEnded }) {
                endExistingOrFulfill()
                return
            }

            // Incoming reportNewIncomingCall may still be in flight — wait before synthetic.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.45, execute: endExistingOrFulfill)
            return
        }

        reportPushKitCompliantIncoming(preferredExistingUUID: nil, completion: completion)
    }

    /// Satisfy PushKit without flashing End & Accept: reuse a live CallKit UUID when possible.
    private func reportPushKitCompliantIncoming(
        preferredExistingUUID: UUID?,
        completion: @escaping () -> Void
    ) {
        let observer = CXCallObserver()
        let liveUUID =
            preferredExistingUUID
            ?? observer.calls.first(where: { !$0.hasEnded })?.uuid
            ?? UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey).flatMap { UUID(uuidString: $0) }

        if let liveUUID {
            reportIncomingUsingExistingCallUUID(liveUUID, completion: completion)
            return
        }
        reportSyntheticCallKitFulfill(completion: completion)
    }

    /// Report the already-active/ringing UUID. CallKit returns `callUUIDAlreadyExists` — no second UI.
    private func reportIncomingUsingExistingCallUUID(_ uuid: UUID, completion: @escaping () -> Void) {
        let normalized = uuid.uuidString.lowercased()
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "aimediatank")
        update.localizedCallerName = "AiMediaTank"
        update.hasVideo = false
        update.supportsDTMF = false
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false

        provider.reportNewIncomingCall(with: uuid, update: update) { [weak self] error in
            if let error {
                // Expected when the call is already on CallKit — PushKit is satisfied.
                print("[AiMediaTankVoipPushBridge] PushKit fulfill via existing UUID \(normalized): \(error.localizedDescription)")
                completion()
                return
            }
            // Race: UUID was not on CallKit. Only end if it is still not our live answered call.
            let pending = UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased()
            let live = CXCallObserver().calls.contains { $0.uuid == uuid && !$0.hasEnded }
            if live || pending == normalized {
                print("[AiMediaTankVoipPushBridge] PushKit fulfill reported live UUID \(normalized) — leaving call")
                completion()
                return
            }
            print("[AiMediaTankVoipPushBridge] PushKit fulfill re-created \(normalized) — ending historically")
            self?.provider.reportCall(
                with: uuid,
                endedAt: Date(timeIntervalSinceNow: -3600),
                reason: .answeredElsewhere
            )
            completion()
        }
    }

    private func reportSyntheticCallKitFulfill(completion: @escaping () -> Void) {
        // Last resort when no CallKit call exists. Historical end avoids a visible ring flash.
        let fulfillId = UUID()
        let fulfillNormalized = fulfillId.uuidString.lowercased()
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: "aimediatank")
        update.localizedCallerName = "AiMediaTank"
        update.hasVideo = false
        update.supportsDTMF = false
        update.supportsHolding = false
        update.supportsGrouping = false
        update.supportsUngrouping = false

        provider.reportNewIncomingCall(with: fulfillId, update: update) { [weak self] error in
            guard let self else {
                completion()
                return
            }
            if let error {
                print("[AiMediaTankVoipPushBridge] synthetic fulfill reportNewIncomingCall failed \(fulfillNormalized): \(error.localizedDescription)")
                completion()
                return
            }
            self.endedCallKitCallIds.insert(fulfillNormalized)
            self.provider.reportCall(
                with: fulfillId,
                endedAt: Date(timeIntervalSinceNow: -3600),
                reason: .answeredElsewhere
            )
            print("[AiMediaTankVoipPushBridge] fulfill VoIP push synthetic reported+ended \(fulfillNormalized)")
            completion()
        }
    }

    /// Spoken lock-screen ring while CallKit UI is up (replaces classic WAV ringtoneSound).
    private func startCallKitRingAnnouncement(displayName: String, announcement: String?, lang: String?) {
        let spoken: String = {
            let trimmed = announcement?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if !trimmed.isEmpty { return trimmed }
            let name = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
            let who = name.isEmpty ? "AiMediaTank" : name
            let code = (lang?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
                ? String(lang!.prefix(2)).lowercased()
                : (Locale.current.languageCode?.lowercased() ?? "en"))
            switch code {
            case "ko": return "\(who)님으로부터 전화"
            case "ja": return "\(who)からの電話"
            case "zh": return "来自\(who)的电话"
            default: return "Call from \(who)"
            }
        }()
        startInAppRingAnnouncement(text: spoken, lang: lang)
    }

    /// In-app / outgoing spoken ring (JS → plugin → notification). Same AVSpeech loop as CallKit.
    private func startInAppRingAnnouncement(text: String, lang: String?) {
        let spoken = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !spoken.isEmpty else { return }
        stopCallKitRingAnnouncement()
        ringAnnouncementGeneration += 1
        let generation = ringAnnouncementGeneration
        ringAnnouncementActive = true
        ringAnnouncementText = spoken
        ringAnnouncementLang = lang?.trimmingCharacters(in: .whitespacesAndNewlines)
        print("[AiMediaTankVoipPushBridge] start spoken ring: \(spoken) lang=\(ringAnnouncementLang ?? "nil")")
        // CallKit may claim audio briefly after report — delay first speak slightly.
        let work = DispatchWorkItem { [weak self] in
            self?.speakCallKitRingAnnouncementNow(generation: generation)
            self?.armCallKitRingWatchdog(generation: generation)
        }
        ringAnnouncementLoopWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35, execute: work)
    }

    private func stopCallKitRingAnnouncement() {
        ringAnnouncementGeneration += 1
        ringAnnouncementActive = false
        ringAnnouncementLoopWork?.cancel()
        ringAnnouncementLoopWork = nil
        ringAnnouncementText = ""
        ringAnnouncementLang = nil
        if ringSpeech.isSpeaking {
            ringSpeech.stopSpeaking(at: .immediate)
        }
    }

    private func speakCallKitRingAnnouncementNow(generation: Int) {
        guard ringAnnouncementActive, generation == ringAnnouncementGeneration else { return }
        let text = ringAnnouncementText
        guard !text.isEmpty else { return }
        let utterance = AVSpeechUtterance(string: text)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate
        // Slightly lower than default (1.0) for a warmer ring announcement.
        utterance.pitchMultiplier = 0.85
        if let tag = ringAnnouncementLang, !tag.isEmpty {
            utterance.voice = AVSpeechSynthesisVoice(language: tag.replacingOccurrences(of: "_", with: "-"))
                ?? AVSpeechSynthesisVoice(language: String(tag.prefix(2)))
        }
        if utterance.voice == nil {
            utterance.voice = AVSpeechSynthesisVoice(language: Locale.current.identifier)
                ?? AVSpeechSynthesisVoice(language: "en-US")
        }
        ringSpeech.speak(utterance)
    }

    /// Restarts speech if CallKit interrupted TTS without a clean didFinish (avoids didCancel race on stop).
    private func armCallKitRingWatchdog(generation: Int) {
        guard ringAnnouncementActive, generation == ringAnnouncementGeneration else { return }
        ringAnnouncementLoopWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self else { return }
            guard self.ringAnnouncementActive, generation == self.ringAnnouncementGeneration else { return }
            if !self.ringSpeech.isSpeaking {
                self.speakCallKitRingAnnouncementNow(generation: generation)
            }
            self.armCallKitRingWatchdog(generation: generation)
        }
        ringAnnouncementLoopWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.2, execute: work)
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        guard ringAnnouncementActive, synthesizer === ringSpeech else { return }
        let generation = ringAnnouncementGeneration
        ringAnnouncementLoopWork?.cancel()
        let work = DispatchWorkItem { [weak self] in
            self?.speakCallKitRingAnnouncementNow(generation: generation)
            self?.armCallKitRingWatchdog(generation: generation)
        }
        ringAnnouncementLoopWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9, execute: work)
    }

    public func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        // Intentional stop or CallKit interrupt — watchdog restarts if still ringing.
    }

    private func performCancelDismiss(callId: String, source: String) {
        let normalized = callId.lowercased()
        if (source == "status_poll" || source == "bridge_dismiss_request"),
           Self.isWithinIncomingGracePeriod(callId: normalized) {
            print("[AiMediaTankVoipPushBridge] defer \(source) dismiss — incoming grace \(normalized)")
            return
        }
        if Self.isCallCancelled(normalized) {
            // Already handled — only re-end if CallKit still shows this call (no new UI).
            if let uuid = UUID(uuidString: normalized),
               CXCallObserver().calls.contains(where: { $0.uuid == uuid && !$0.hasEnded }) {
                endCallKitCall(uuid: uuid, reason: .remoteEnded, notifyJs: false)
            }
            return
        }
        reportCancelAck(callId: normalized, source: source)
        postVoiceTrace(callId: normalized, event: "callkit_dismiss", detail: ["source": source])
        Self.markCallCancelled(normalized)
        clearPendingCallKitAnswer()
        stopCallKitRingAnnouncement()
        if let uuid = UUID(uuidString: normalized) {
            endCallKitCall(uuid: uuid, reason: .remoteEnded, notifyJs: true)
        }
        NotificationCenter.default.post(
            name: Self.cancelPushNotification,
            object: nil,
            userInfo: ["callId": normalized]
        )
        // Retries only if CallKit failed to clear — keep short to avoid UI flicker.
        if let uuid = UUID(uuidString: normalized),
           CXCallObserver().calls.contains(where: { $0.uuid == uuid && !$0.hasEnded }) {
            scheduleDismissRetries(for: normalized)
        }
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
                let announcement = userInfo["announcement"] as? String
                let lang = userInfo["lang"] as? String
                self?.startCallKitRingAnnouncement(
                    displayName: displayName,
                    announcement: announcement,
                    lang: lang
                )
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
                let uuid = UUID(uuidString: normalizedCallId)
                // Duplicate cancel: if CallKit still shows the call, end it; else synthetic only
                // (must not reportCall(ended) on a never-reported UUID — breaks PushKit).
                if Self.isCallCancelled(normalizedCallId) {
                    let stillRinging = uuid.map { id in
                        CXCallObserver().calls.contains { $0.uuid == id && !$0.hasEnded }
                    } ?? false
                    fulfillVoipPushReportingRequirement(endingCallId: stillRinging ? uuid : nil) {
                        completeOnce()
                    }
                    return
                }
                fulfillVoipPushReportingRequirement(endingCallId: uuid) {
                    self.performCancelDismiss(callId: normalizedCallId, source: "voip_cancel_push")
                    completeOnce()
                }
            } else {
                print("[AiMediaTankVoipPushBridge] cancel push MISSING callId payloadKeys=\(payloadDict.keys.map { String(describing: $0) }.joined(separator: ","))")
                fulfillVoipPushReportingRequirement {
                    completeOnce()
                }
            }
            return
        }

        guard let callIdString = payloadString(payloadDict, key: "callId"),
              let handle = payloadString(payloadDict, key: "handle"),
              let displayName = payloadString(payloadDict, key: "displayName") else {
            print("[AiMediaTankVoipPushBridge] ignored VoIP push (not cancel/incoming) keys=\(payloadDict.keys.map { String(describing: $0) }.joined(separator: ","))")
            fulfillVoipPushReportingRequirement {
                completeOnce()
            }
            return
        }
        guard let callId = UUID(uuidString: callIdString.lowercased()) else {
            print("[AiMediaTankVoipPushBridge] ignored VoIP push — invalid callId UUID \(callIdString)")
            fulfillVoipPushReportingRequirement {
                completeOnce()
            }
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
            // Prefer live CallKit UUID if any; never flash a second End & Accept over an answered call.
            reportPushKitCompliantIncoming(preferredExistingUUID: nil) {
                completeOnce()
            }
            return
        }

        if isIncomingCallAlreadyHandled(callId: normalizedCallId) {
            print("[AiMediaTankVoipPushBridge] ignored incoming push — call already answered \(normalizedCallId)")
            postVoiceTrace(callId: normalizedCallId, event: "grace_skip_answered")
            // Re-report the answered UUID (callUUIDAlreadyExists) — never a new synthetic
            // UUID, which flashes Decline / End & Accept over the live call.
            reportPushKitCompliantIncoming(preferredExistingUUID: callId) {
                completeOnce()
            }
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
        let video = (payloadDict["video"] as? Bool)
            ?? ((payloadDict["video"] as? String)?.lowercased() == "true")
            ?? false
        Self.noteCallHasVideo(normalizedCallId, hasVideo: video)

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
                // Cancel may have arrived while reportNewIncomingCall was in flight.
                if Self.isCallCancelled(normalizedCallId) {
                    print("[AiMediaTankVoipPushBridge] incoming reported but already cancelled — ending \(normalizedCallId)")
                    self.endCallKitCall(uuid: callId, reason: .remoteEnded, notifyJs: true)
                    self.stopCallKitRingAnnouncement()
                    completeOnce()
                    forwardToPlugin(reportedToCallKit: true)
                    return
                }
                self.postVoiceTrace(callId: normalizedCallId, event: "callkit_report_ok")
                let announcement = self.payloadString(payloadDict, key: "announcement")
                let lang = self.payloadString(payloadDict, key: "lang")
                self.startCallKitRingAnnouncement(
                    displayName: displayName,
                    announcement: announcement,
                    lang: lang
                )
                // Prefetch offer/ICE while ringing so Accept can createAnswer immediately.
                if let token = self.declineToken(from: payloadDict) ??
                    UserDefaults.standard.string(forKey: Self.declineTokenKey(for: normalizedCallId)),
                   !token.isEmpty
                {
                    NativeVoiceCallEngine.shared.prefetchBootstrapWhileRinging(
                        callId: normalizedCallId,
                        token: token,
                        baseURL: self.voiceApiBaseURL()
                    )
                }
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
        stopCallKitRingAnnouncement()
        statusWatchGeneration.keys.forEach { stopCallStatusWatch(callId: $0) }
        dismissRetryGeneration.removeAll()
        clearPendingCallKitAnswer()
        tearDownNativeVoiceAfterCallKitReset()
        // Never call reportCall / CXEndCallAction here — the provider was reset and is invalid.
        endedCallKitCallIds.removeAll()
        UserDefaults.standard.removeObject(forKey: Self.ringingCallIdsKey)
        releaseAudioSession()
    }

    /// Push in-app call state after unlock — never foreground WebView during CallKit (#1→#3).
    func syncLockScreenCallUiIfNeeded() {
        guard Self.canDeliverToWebView() else { return }
        if NativeVoiceCallEngine.shared.isMediaConnected {
            NativeVoiceCallEngine.shared.syncUiIfConnected()
            return
        }

        let callId = UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased()
            ?? NativeVoiceCallEngine.shared.activeCallId?.lowercased()
        guard let callId, !callId.isEmpty else { return }
        guard Self.isLockScreenNativeAnswer(callId: callId)
            || NativeVoiceCallEngine.shared.activeCallId?.lowercased() == callId else { return }
        if NativeVoiceCallEngine.shared.isMediaConnected { return }

        let token = UserDefaults.standard.string(forKey: Self.declineTokenKey(for: callId))
        pendingJsAnswerCallId = callId
        pendingJsAnswerDeclineToken = token
        deliverLockScreenCallUiToJs(callId: callId, declineToken: token)
    }

    /// Push flag can omit video= while the offer still has m=video — trust prefetch too.
    private static func resolveCallHasVideo(_ callId: String) -> Bool {
        if callHasVideo(callId) { return true }
        if NativeVoiceCallEngine.shared.prefetchedOfferHasVideo(callId: callId) {
            noteCallHasVideo(callId, hasVideo: true)
            return true
        }
        return false
    }

    /// Video Accept while unlocked uses WKWebView WebRTC (same as outgoing).
    /// Lock-screen / audio uses the native engine (`isLockScreenNativeAnswer`).
    private func callKitAnswerDeliveryFlags(callId: String) -> (useSessionWebRtc: Bool, nativeWebRtc: Bool) {
        let preferJsVideo = Self.resolveCallHasVideo(callId) && !Self.isLockScreenNativeAnswer(callId: callId)
        return (preferJsVideo, !preferJsVideo)
    }

    private func deliverLockScreenCallUiToJs(
        callId: String,
        declineToken: String?,
        useSessionWebRtc: Bool? = nil,
        nativeWebRtc: Bool? = nil
    ) {
        guard Self.canDeliverToWebView() else { return }
        let flags = callKitAnswerDeliveryFlags(callId: callId)
        let session = useSessionWebRtc ?? flags.useSessionWebRtc
        let native = nativeWebRtc ?? flags.nativeWebRtc
        var userInfo: [String: Any] = [
            "callId": callId,
            "useSessionWebRtc": session,
            "nativeWebRtc": native,
        ]
        if Self.resolveCallHasVideo(callId) {
            userInfo["hasVideo"] = true
        }
        if let declineToken, !declineToken.isEmpty {
            userInfo["declineToken"] = declineToken
        }
        print(
            "[AiMediaTankVoipPushBridge] deliver call UI to JS \(callId) session=\(session) native=\(native) video=\(Self.resolveCallHasVideo(callId))"
        )
        NotificationCenter.default.post(
            name: Self.callKitAnswerNotification,
            object: nil,
            userInfo: userInfo
        )
        injectCallKitAnswerToWebView(
            callId: callId,
            declineToken: declineToken,
            useSessionWebRtc: session,
            nativeWebRtc: native
        )
    }

    private func deliverPendingCallKitAnswerToJs() {
        let callId = pendingJsAnswerCallId
            ?? UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey)?.lowercased()
        guard let callId, !callId.isEmpty else { return }

        if Self.canDeliverToWebView() {
            let token = pendingJsAnswerDeclineToken
                ?? UserDefaults.standard.string(forKey: Self.declineTokenKey(for: callId))
            // Preserve JS-video vs native flags — defaulting native=true broke unlocked video Accept.
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
        // Tint only (never hide WebView) — avoids black flash while shell/call UI paints.
        let callBg = UIColor(red: 0.10, green: 0.07, blue: 0.04, alpha: 1)
        bridge.view.backgroundColor = callBg
        webView.backgroundColor = callBg
        webView.scrollView.backgroundColor = callBg
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
        let videoJs = Self.resolveCallHasVideo(callId) ? ", hasVideo: true" : ""
        let js = """
        (function(){
          try {
            var id = 'aimediatank-accept-shell';
            if (!document.getElementById(id)) {
              var el = document.createElement('div');
              el.id = id;
              el.setAttribute('aria-hidden', 'true');
              el.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:linear-gradient(180deg,#3d2914 0%,#1a1208 45%,#0d0906 100%);pointer-events:none;';
              (document.documentElement || document.body).appendChild(el);
            }
            function removeShell() {
              var n = document.getElementById(id);
              if (n) n.remove();
            }
            if (document.documentElement.getAttribute('data-amt-call-active') === '1') {
              removeShell();
            } else {
              var mo = new MutationObserver(function() {
                if (document.documentElement.getAttribute('data-amt-call-active') === '1') {
                  mo.disconnect();
                  removeShell();
                }
              });
              mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-amt-call-active'] });
              setTimeout(function(){ mo.disconnect(); removeShell(); }, 8000);
            }
            window.addEventListener('aimediatank-native-call-connected', function once() {
              window.removeEventListener('aimediatank-native-call-connected', once);
              removeShell();
            });
            window.dispatchEvent(new CustomEvent('aimediatank-callkit-answer', {
              detail: { callId: '\(callId)'\(tokenJs)\(sessionJs)\(nativeJs)\(videoJs) }
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
        stopCallKitRingAnnouncement()
        // Cover feed immediately; WebView stays visible and paints call UI underneath.
        beginAcceptCover()
        configureAudioSession()
        cancelDismissRetries(callId: callId)
        markPendingCallKitAnswer(callId: callId)
        // Keep status watch running after answer so caller hangup/end dismisses CallKit promptly.
        startAnswerBackgroundSupport(callId: callId)
        postNativeCallKitAccept(callId: callId)
        postVoiceTrace(callId: callId, event: "callkit_answer")
        let token = UserDefaults.standard.string(forKey: Self.declineTokenKey(for: callId)) ?? ""
        let wantsVideo = Self.resolveCallHasVideo(callId)
        // Outgoing video already works in WKWebView. Prefer the same path when unlocked —
        // native Metal video has not been reliable for CallKit Accept.
        let preferJsVideo = wantsVideo && Self.canDeliverToWebView()
        if !token.isEmpty {
            if preferJsVideo {
                print("[AiMediaTankVoipPushBridge] CallKit Accept — JS WebRTC video \(callId)")
                Self.clearLockScreenNativeAnswer(callId: callId)
                NativeVoiceCallEngine.shared.abandonForJsHandoff(callId: callId)
            } else {
                // Lock-screen / audio: native WebRTC (CallKit audio + optional video overlay).
                Self.markLockScreenNativeAnswer(callId: callId)
                print("[AiMediaTankVoipPushBridge] CallKit Accept — native WebRTC \(callId) video=\(wantsVideo)")
                NativeVoiceCallEngine.shared.prepareAnswer(
                    callId: callId,
                    token: token,
                    baseURL: voiceApiBaseURL(),
                    wantsVideo: wantsVideo
                )
                scheduleCallKitAudioActivationFallback(callId: callId)
            }
        } else {
            print("[AiMediaTankVoipPushBridge] WebRTC skipped — no decline token \(callId)")
        }
        pendingJsAnswerCallId = callId
        pendingJsAnswerDeclineToken = token.isEmpty ? nil : token
        // Fulfill ASAP so CallKit activates audio while signaling is already in flight.
        action.fulfill()
        reportCallKitHasVideo(callId: callId)
        scheduleJsAnswerDeliveryRetries(callId: callId)
        if Self.canDeliverToWebView() {
            deliverLockScreenCallUiToJs(
                callId: callId,
                declineToken: token.isEmpty ? nil : token,
                useSessionWebRtc: preferJsVideo,
                nativeWebRtc: !preferJsVideo
            )
        }
        DispatchQueue.main.async { [weak self] in
            self?.beginAcceptCover()
            if wantsVideo, !preferJsVideo {
                NativeVoiceCallEngine.shared.layoutVideoOverlayForJsControls()
            }
        }
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
                    baseURL: voiceApiBaseURL(),
                    wantsVideo: Self.callHasVideo(callId)
                )
            }
            return
        }
        // Unlocked video Accept: do not start native WebRTC (would race WKWebView).
        if Self.resolveCallHasVideo(callId) {
            print("[AiMediaTankVoipPushBridge] retry JS WebRTC video deliver \(callId)")
            if Self.canDeliverToWebView() {
                NativeVoiceCallEngine.shared.abandonForJsHandoff(callId: callId)
                deliverLockScreenCallUiToJs(
                    callId: callId,
                    declineToken: token,
                    useSessionWebRtc: true,
                    nativeWebRtc: false
                )
            }
            return
        }
        print("[AiMediaTankVoipPushBridge] retry native WebRTC connect \(callId)")
        NativeVoiceCallEngine.shared.prepareAnswer(
            callId: callId,
            token: token,
            baseURL: voiceApiBaseURL(),
            wantsVideo: false
        )
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let callId = action.callUUID.uuidString.lowercased()
        stopCallKitRingAnnouncement()
        audioActivationFallbackGeneration = nil
        Self.clearLockScreenNativeAnswer(callId: callId)
        Self.clearCallHasVideo(callId)
        endAcceptCover(reason: "user_end")
        let alreadyHandled = endedCallKitCallIds.contains(callId)
        if !alreadyHandled {
            endedCallKitCallIds.insert(callId)
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
            Self.noteCallDismissed(callId)
        }
        action.fulfill()
        // CallKit invokes provider(_:didDeactivate:) — release audio there only.
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
        // Do not setCategory here — CallKit already activated the session; reconfiguring
        // after activate can leave capture working but remote playback silent.
        stopCallKitRingAnnouncement()
        NativeVoiceCallEngine.shared.audioSessionActivated()
        if let callId = UserDefaults.standard.string(forKey: Self.pendingAnswerCallIdKey) {
            postVoiceTrace(callId: callId, event: "callkit_audio_activated")
        }
        deliverPendingCallKitAnswerToJs()
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        NativeVoiceCallEngine.shared.audioSessionDeactivated()
        let callStillLive = hasActiveCallKitCall()
            || hasPendingCallKitAnswer()
            || NativeVoiceCallEngine.shared.isMediaConnected
            || NativeVoiceCallEngine.shared.isActive
        if !callStillLive {
            releaseAudioSession()
        } else {
            print("[AiMediaTankVoipPushBridge] skip audio release — call still active")
        }
    }
}

// MARK: - NativeVoiceCallEngineDelegate

extension AiMediaTankVoipPushBridge: NativeVoiceCallEngineDelegate {
    func nativeVoiceCallEngineDidConnect(callId: String, caller: [String: Any]?) {
        print("[AiMediaTankVoipPushBridge] native WebRTC connected \(callId)")
        // Do not unveil here — wait for data-amt-call-active so home feed cannot flash.
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
