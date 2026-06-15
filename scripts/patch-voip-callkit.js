#!/usr/bin/env node
/**
 * Patch @kapsula-chat/capacitor-push-calls for AiMediaTank:
 * - CallKit custom ringtone
 * - Native CallKit decline -> POST /api/chat/voice/native-decline (lock screen, no JS)
 */
const fs = require('fs')
const path = require('path')

const pluginDir = path.join(__dirname, '..', 'node_modules', '@kapsula-chat', 'capacitor-push-calls', 'ios', 'Plugin')
const callManagerPath = path.join(pluginDir, 'CallManager.swift')
const pluginSwiftPath = path.join(pluginDir, 'CapacitorVoipCallsPlugin.swift')

if (!fs.existsSync(callManagerPath)) {
  console.warn('[patch-voip-callkit] CallManager.swift not found; skip')
  process.exit(0)
}

let callManager = fs.readFileSync(callManagerPath, 'utf8')
let pluginSwift = fs.existsSync(pluginSwiftPath) ? fs.readFileSync(pluginSwiftPath, 'utf8') : ''

const REQUEST_BRIDGE_DISMISS = 'AiMediaTankRequestBridgeDismiss'
const DISMISS_FINAL = 'skip bridge dismiss when already cancelled'

const RINGTONE_MARKER = 'configuration.ringtoneSound = "incoming-ring.wav"'
const AUDIO_ONLY_MARKER = 'AiMediaTank audio-only CallKit'
if (!callManager.includes(AUDIO_ONLY_MARKER)) {
  if (callManager.includes('configuration.supportsVideo = true')) {
    callManager = callManager.replace(
      'configuration.supportsVideo = true',
      `// ${AUDIO_ONLY_MARKER}\n        configuration.supportsVideo = false`,
    )
    console.log('[patch-voip-callkit] set CallManager supportsVideo false (audio-only)')
  }
}

if (!callManager.includes(RINGTONE_MARKER)) {
  const anchor = 'configuration.includesCallsInRecents = true'
  if (callManager.includes(anchor)) {
    callManager = callManager.replace(
      anchor,
      `${anchor}
        configuration.ringtoneSound = "incoming-ring.wav"`,
    )
    console.log('[patch-voip-callkit] set CallKit ringtoneSound to incoming-ring.wav')
  }
}

const DECLINE_MARKER = 'AiMediaTank syncCallDeclineToServer'
if (!callManager.includes(DECLINE_MARKER)) {
  if (!callManager.includes('var declineToken: String?')) {
    callManager = callManager.replace(
      'var isOutgoing: Bool = false',
      'var isOutgoing: Bool = false\n        var declineToken: String?',
    )
  }

  callManager = callManager.replace(
    'func reportIncomingCall(uuid: UUID, handle: String, displayName: String, handleType: CXHandle.HandleType, video: Bool, completion: @escaping (Error?) -> Void) {',
    'func reportIncomingCall(uuid: UUID, handle: String, displayName: String, handleType: CXHandle.HandleType, video: Bool, declineToken: String? = nil, completion: @escaping (Error?) -> Void) {',
  )

  callManager = callManager.replace(
    'let call = Call(uuid: uuid, handle: handle, displayName: displayName, isOutgoing: false)',
    'var call = Call(uuid: uuid, handle: handle, displayName: displayName, isOutgoing: false)\n        call.declineToken = declineToken',
  )

  callManager = callManager.replace(
    `    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        activeCalls.removeValue(forKey: action.callUUID)
        
        plugin?.notifyListeners(event: "callEnded", data: ["callId": action.callUUID.uuidString])
        
        action.fulfill()
    }`,
    `    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        let endedCall = activeCalls[action.callUUID]
        activeCalls.removeValue(forKey: action.callUUID)

        if let endedCall, !endedCall.isOutgoing, let token = endedCall.declineToken {
            plugin?.syncCallDeclineToServer(callId: action.callUUID.uuidString.lowercased(), token: token)
        }

        plugin?.notifyListeners(event: "callEnded", data: ["callId": action.callUUID.uuidString])

        action.fulfill()
    }`,
  )

  console.log('[patch-voip-callkit] patched CallManager for native decline sync')
}

const CANCEL_MARKER = 'AiMediaTank cancelIncomingCall'
const CANCEL_V2_MARKER = 'CXEndCallAction cancel remote ring'
if (!callManager.includes(CANCEL_MARKER)) {
  callManager = callManager.replace(
    '    // MARK: - End Call\n    func endCall(uuid: UUID) {',
    `    // MARK: - Cancel Incoming Call (${CANCEL_MARKER})
    func cancelIncomingCall(uuid: UUID) {
        // ${CANCEL_V2_MARKER}
        activeCalls.removeValue(forKey: uuid)
        provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        let endCallAction = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: endCallAction)) { _ in }
    }

    // MARK: - End Call
    func endCall(uuid: UUID) {`,
  )
  console.log('[patch-voip-callkit] patched CallManager for remote cancel sync')
} else if (!callManager.includes(CANCEL_V2_MARKER)) {
  callManager = callManager.replace(
    `    func cancelIncomingCall(uuid: UUID) {
        provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        activeCalls.removeValue(forKey: uuid)
    }`,
    `    func cancelIncomingCall(uuid: UUID) {
        // ${CANCEL_V2_MARKER}
        activeCalls.removeValue(forKey: uuid)
        provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        let endCallAction = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: endCallAction)) { _ in }
    }`,
  )
  console.log('[patch-voip-callkit] upgraded CallManager cancelIncomingCall')
}

fs.writeFileSync(callManagerPath, callManager)

const PLUGIN_MARKER = 'func syncCallDeclineToServer'
if (pluginSwift && !pluginSwift.includes(PLUGIN_MARKER)) {
  const insertBefore = 'internal func emitEvent(_ event: String, data: [String: Any]) {'
  const helper = `
    // ${DECLINE_MARKER}
    internal func syncCallDeclineToServer(callId: String, token: String) {
        guard let url = URL(string: "https://aimediatank.com/api/chat/voice/native-decline") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["callId": callId, "token": token])
        URLSession.shared.dataTask(with: request).resume()
    }

`
  if (pluginSwift.includes(insertBefore)) {
    pluginSwift = pluginSwift.replace(insertBefore, helper + insertBefore)
  }

  pluginSwift = pluginSwift.replace(
    `        callManager?.reportIncomingCall(
            uuid: callId,
            handle: handle,
            displayName: displayName,
            handleType: handleType,
            video: video
        ) { error in
            if let error {
                print("Error reporting incoming call: \(error.localizedDescription)")
            }
            completion()
        }`,
    `        let declineToken = (payloadDict["metadata"] as? [String: Any])?["declineToken"] as? String

        callManager?.reportIncomingCall(
            uuid: callId,
            handle: handle,
            displayName: displayName,
            handleType: handleType,
            video: video,
            declineToken: declineToken
        ) { error in
            if let error {
                print("Error reporting incoming call: \(error.localizedDescription)")
            }
            completion()
        }`,
  )

  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] patched CapacitorVoipCallsPlugin for VoIP push decline sync')
}

const CANCEL_PUSH_MARKER = 'AiMediaTank voipCancelPush'
if (pluginSwift && !pluginSwift.includes(CANCEL_PUSH_MARKER)) {
  pluginSwift = pluginSwift.replace(
    `        let payloadDict = payload.dictionaryPayload

        guard let callIdString = payloadDict["callId"] as? String,`,
    `        let payloadDict = payload.dictionaryPayload

        // ${CANCEL_PUSH_MARKER}
        if let action = payloadDict["action"] as? String, action == "cancel",
           let cancelCallIdString = payloadDict["callId"] as? String,
           let cancelCallId = UUID(uuidString: cancelCallIdString) {
            callManager?.cancelIncomingCall(uuid: cancelCallId)
            completion()
            return
        }

        guard let callIdString = payloadDict["callId"] as? String,`,
  )

  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] patched CapacitorVoipCallsPlugin for VoIP cancel push')
}

const POLL_MARKER = 'AiMediaTank nativeCallStatusPolling'
if (pluginSwift && !pluginSwift.includes(POLL_MARKER)) {
  if (!pluginSwift.includes('callStatusPollTimers')) {
    pluginSwift = pluginSwift.replace(
      '    private var voipRegistry: PKPushRegistry?',
      '    private var voipRegistry: PKPushRegistry?\n    private var callStatusPollTimers: [String: Timer] = [:]',
    )
  }

  const pollHelper = `
    // ${POLL_MARKER}
    private func voipPayloadString(_ dict: [AnyHashable: Any], key: String) -> String? {
        if let value = dict[key] as? String { return value }
        if let value = dict[key] as? NSString { return value as String }
        return nil
    }

    internal func startCallStatusPolling(callId: String, token: String) {
        stopCallStatusPolling(callId: callId)
        let timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.pollCallStatus(callId: callId, token: token)
        }
        callStatusPollTimers[callId] = timer
    }

    internal func stopCallStatusPolling(callId: String) {
        callStatusPollTimers[callId]?.invalidate()
        callStatusPollTimers.removeValue(forKey: callId)
    }

    private func pollCallStatus(callId: String, token: String) {
        var components = URLComponents(string: "https://aimediatank.com/api/chat/voice/native-status")!
        components.queryItems = [
            URLQueryItem(name: "callId", value: callId),
            URLQueryItem(name: "token", value: token),
        ]
        guard let url = components.url else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self,
                  let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let status = json["status"] as? String else { return }
            if status == "ringing" || status == "active" { return }
            DispatchQueue.main.async {
                if let uuid = UUID(uuidString: callId) {
                    self.callManager?.cancelIncomingCall(uuid: uuid)
                }
                self.stopCallStatusPolling(callId: callId)
            }
        }.resume()
    }

`
  const insertBefore = pluginSwift.includes('func syncCallDeclineToServer')
    ? '    // AiMediaTank syncCallDeclineToServer'
    : 'internal func emitEvent(_ event: String, data: [String: Any]) {'
  if (pluginSwift.includes(insertBefore)) {
    pluginSwift = pluginSwift.replace(insertBefore, pollHelper + insertBefore)
  }

  const incomingVoipBlock = `        callManager?.reportIncomingCall(
            uuid: callId,
            handle: handle,
            displayName: displayName,
            handleType: handleType,
            video: video
        ) { error in
            if let error {
                print("Error reporting incoming call: \\(error.localizedDescription)")
            }
            completion()
        }`

  const incomingVoipPatched = `        let declineToken = (payloadDict["metadata"] as? [String: Any])?["declineToken"] as? String
        let pollCallId = callIdString.lowercased()

        callManager?.reportIncomingCall(
            uuid: callId,
            handle: handle,
            displayName: displayName,
            handleType: handleType,
            video: video,
            declineToken: declineToken
        ) { [weak self] error in
            if error == nil, let token = declineToken {
                self?.startCallStatusPolling(callId: pollCallId, token: token)
            }
            if let error {
                print("Error reporting incoming call: \\(error.localizedDescription)")
            }
            completion()
        }`

  if (pluginSwift.includes(incomingVoipBlock)) {
    pluginSwift = pluginSwift.replace(incomingVoipBlock, incomingVoipPatched)
    console.log('[patch-voip-callkit] patched VoIP incoming handler for status polling')
  }

  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] added native call status polling')
}

const CANCEL_PUSH_V2 = 'AiMediaTank voipCancelPushV2'
if (pluginSwift && pluginSwift.includes('AiMediaTank voipCancelPush') && !pluginSwift.includes(CANCEL_PUSH_V2)) {
  pluginSwift = pluginSwift.replace(
    `        // AiMediaTank voipCancelPush
        if let action = payloadDict["action"] as? String, action == "cancel",
           let cancelCallIdString = payloadDict["callId"] as? String,
           let cancelCallId = UUID(uuidString: cancelCallIdString) {
            callManager?.cancelIncomingCall(uuid: cancelCallId)
            completion()
            return
        }`,
    `        // AiMediaTank voipCancelPush / ${CANCEL_PUSH_V2}
        if voipPayloadString(payloadDict, key: "action") == "cancel",
           let cancelCallIdString = voipPayloadString(payloadDict, key: "callId"),
           let cancelCallId = UUID(uuidString: cancelCallIdString) {
            DispatchQueue.main.async { [weak self] in
                self?.stopCallStatusPolling(callId: cancelCallIdString.lowercased())
                self?.callManager?.cancelIncomingCall(uuid: cancelCallId)
                completion()
            }
            return
        }`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] upgraded VoIP cancel push handler')
}

const STOP_POLL_MARKER = 'stopCallStatusPolling on CallKit action'
if (pluginSwift.includes(POLL_MARKER) && !callManager.includes(STOP_POLL_MARKER)) {
  callManager = callManager.replace(
    `    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        configureAudioSession()
        
        plugin?.notifyListeners(event: "callAnswered", data: ["callId": action.callUUID.uuidString])`,
    `    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        configureAudioSession()
        // ${STOP_POLL_MARKER}
        plugin?.stopCallStatusPolling(callId: action.callUUID.uuidString.lowercased())

        plugin?.notifyListeners(event: "callAnswered", data: ["callId": action.callUUID.uuidString])`,
  )
  callManager = callManager.replace(
    `        if let endedCall, !endedCall.isOutgoing, let token = endedCall.declineToken {
            plugin?.syncCallDeclineToServer(callId: action.callUUID.uuidString.lowercased(), token: token)
        }

        plugin?.notifyListeners(event: "callEnded", data: ["callId": action.callUUID.uuidString])`,
    `        // ${STOP_POLL_MARKER}
        plugin?.stopCallStatusPolling(callId: action.callUUID.uuidString.lowercased())

        if let endedCall, !endedCall.isOutgoing, let token = endedCall.declineToken {
            plugin?.syncCallDeclineToServer(callId: action.callUUID.uuidString.lowercased(), token: token)
        }

        plugin?.notifyListeners(event: "callEnded", data: ["callId": action.callUUID.uuidString])`,
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] stop polling on CallKit answer/end')
}

const CANCEL_ALL_MARKER = 'cancelAllIncomingCalls'
if (!callManager.includes(CANCEL_ALL_MARKER)) {
  callManager = callManager.replace(
    `    func cancelIncomingCall(uuid: UUID) {
        // CXEndCallAction cancel remote ring
        activeCalls.removeValue(forKey: uuid)
        provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        let endCallAction = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: endCallAction)) { _ in }
    }`,
    `    func cancelIncomingCall(uuid: UUID) {
        // CXEndCallAction cancel remote ring
        activeCalls.removeValue(forKey: uuid)
        provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        let endCallAction = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: endCallAction)) { _ in }
    }

    func cancelAllIncomingCalls() {
        // ${CANCEL_ALL_MARKER}
        let incomingIds = activeCalls.filter { !$0.value.isOutgoing }.map { $0.key }
        for uuid in incomingIds {
            cancelIncomingCall(uuid: uuid)
        }
    }`,
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] added cancelAllIncomingCalls')
}

const CANCEL_ALL_FIX_MARKER = 'map { $0.key }'
if (callManager.includes(CANCEL_ALL_MARKER) && !callManager.includes(CANCEL_ALL_FIX_MARKER)) {
  callManager = callManager.replace(
    'let incomingIds = activeCalls.filter { !$0.value.isOutgoing }.map(.key)',
    'let incomingIds = activeCalls.filter { !$0.value.isOutgoing }.map { $0.key }',
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] fixed cancelAllIncomingCalls Swift map syntax')
}

const POLL_V2_MARKER = 'beginBackgroundTask call status watch'
if (pluginSwift && pluginSwift.includes(POLL_MARKER) && !pluginSwift.includes(POLL_V2_MARKER)) {
  if (!pluginSwift.includes('callStatusBackgroundTasks')) {
    pluginSwift = pluginSwift.replace(
      '    private var callStatusPollTimers: [String: Timer] = [:]',
      '    private var callStatusPollTimers: [String: Timer] = [:]\n    private var callStatusBackgroundTasks: [String: UIBackgroundTaskIdentifier] = [:]',
    )
  }

  pluginSwift = pluginSwift.replace(
    `    internal func startCallStatusPolling(callId: String, token: String) {
        stopCallStatusPolling(callId: callId)
        let timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.pollCallStatus(callId: callId, token: token)
        }
        callStatusPollTimers[callId] = timer
    }

    internal func stopCallStatusPolling(callId: String) {
        callStatusPollTimers[callId]?.invalidate()
        callStatusPollTimers.removeValue(forKey: callId)
    }

    private func pollCallStatus(callId: String, token: String) {
        var components = URLComponents(string: "https://aimediatank.com/api/chat/voice/native-status")!
        components.queryItems = [
            URLQueryItem(name: "callId", value: callId),
            URLQueryItem(name: "token", value: token),
        ]
        guard let url = components.url else { return }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self,
                  let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let status = json["status"] as? String else { return }
            if status == "ringing" || status == "active" { return }
            DispatchQueue.main.async {
                if let uuid = UUID(uuidString: callId) {
                    self.callManager?.cancelIncomingCall(uuid: uuid)
                }
                self.stopCallStatusPolling(callId: callId)
            }
        }.resume()
    }`,
    `    internal func startCallStatusPolling(callId: String, token: String) {
        // ${POLL_V2_MARKER}
        stopCallStatusPolling(callId: callId)

        var bgTask = UIBackgroundTaskIdentifier.invalid
        bgTask = UIApplication.shared.beginBackgroundTask(withName: "AiMediaTank voice call watch") { [weak self] in
            self?.stopCallStatusPolling(callId: callId)
        }
        if bgTask != .invalid {
            callStatusBackgroundTasks[callId] = bgTask
        }

        func schedulePoll(attempt: Int) {
            guard attempt < 120, callStatusBackgroundTasks[callId] != nil else {
                self.stopCallStatusPolling(callId: callId)
                return
            }
            self.pollCallStatus(callId: callId, token: token) { shouldContinue in
                if shouldContinue {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                        schedulePoll(attempt: attempt + 1)
                    }
                } else {
                    self.stopCallStatusPolling(callId: callId)
                }
            }
        }

        schedulePoll(attempt: 0)
    }

    internal func stopCallStatusPolling(callId: String) {
        callStatusPollTimers[callId]?.invalidate()
        callStatusPollTimers.removeValue(forKey: callId)
        if let bgTask = callStatusBackgroundTasks.removeValue(forKey: callId), bgTask != .invalid {
            UIApplication.shared.endBackgroundTask(bgTask)
        }
    }

    internal func dismissRemoteVoipCancel(callIdString: String) {
        let normalized = callIdString.lowercased()
        stopCallStatusPolling(callId: normalized)
        if let uuid = UUID(uuidString: normalized) {
            callManager?.cancelIncomingCall(uuid: uuid)
        } else {
            callManager?.cancelAllIncomingCalls()
        }
    }

    private func pollCallStatus(callId: String, token: String, completion: @escaping (Bool) -> Void) {
        var components = URLComponents(string: "https://aimediatank.com/api/chat/voice/native-status")!
        components.queryItems = [
            URLQueryItem(name: "callId", value: callId),
            URLQueryItem(name: "token", value: token),
        ]
        guard let url = components.url else {
            completion(true)
            return
        }
        URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
            guard let self = self else {
                completion(false)
                return
            }
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let status = json["status"] as? String else {
                completion(true)
                return
            }
            if status == "ringing" {
                completion(true)
                return
            }
            DispatchQueue.main.async {
                if status != "active" {
                    if let uuid = UUID(uuidString: callId) {
                        self.callManager?.cancelIncomingCall(uuid: uuid)
                    } else {
                        self.callManager?.cancelAllIncomingCalls()
                    }
                }
                completion(false)
            }
        }.resume()
    }`,
  )

  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] upgraded polling to background-task chain')
}

const CANCEL_PUSH_V3 = 'AiMediaTank voipCancelPushV3'
if (pluginSwift && pluginSwift.includes('AiMediaTank voipCancelPush') && !pluginSwift.includes(CANCEL_PUSH_V3)) {
  pluginSwift = pluginSwift.replace(
    /        \/\/ AiMediaTank voipCancelPush[^\n]*\n        if voipPayloadString\(payloadDict, key: "action"\) == "cancel",[\s\S]*?            return\n        }/,
    `        // AiMediaTank voipCancelPush / ${CANCEL_PUSH_V3}
        if voipPayloadString(payloadDict, key: "action") == "cancel",
           let cancelCallIdString = voipPayloadString(payloadDict, key: "callId") {
            let dismiss = { [weak self] in
                self?.dismissRemoteVoipCancel(callIdString: cancelCallIdString)
            }
            if Thread.isMainThread {
                dismiss()
            } else {
                DispatchQueue.main.sync(execute: dismiss)
            }
            completion()
            return
        }`,
  )

  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] upgraded VoIP cancel push to sync dismiss')
}

// Re-read patched files for incremental upgrades below.
callManager = fs.readFileSync(callManagerPath, 'utf8')
if (fs.existsSync(pluginSwiftPath)) {
  pluginSwift = fs.readFileSync(pluginSwiftPath, 'utf8')
}

const EARLY_PUSHKIT_MARKER = 'AiMediaTank earlyPushKitRegistry'
const BRIDGE_V1_MARKER = 'AiMediaTank VoipPushBridge'
if (
  pluginSwift &&
  !pluginSwift.includes(EARLY_PUSHKIT_MARKER) &&
  !pluginSwift.includes(BRIDGE_V1_MARKER)
) {
  pluginSwift = pluginSwift.replace(
    `    override public func load() {
        callManager = CallManager(plugin: self)

        NotificationCenter.default.addObserver(`,
    `    override public func load() {
        callManager = CallManager(plugin: self)

        // ${EARLY_PUSHKIT_MARKER}
        DispatchQueue.main.async {
            if self.voipRegistry == nil {
                self.voipRegistry = PKPushRegistry(queue: DispatchQueue.main)
                self.voipRegistry?.delegate = self
                self.voipRegistry?.desiredPushTypes = [.voIP]
            }
        }

        NotificationCenter.default.addObserver(`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] register PushKit on plugin load (cold-start VoIP)')
}

const CALL_OBSERVER_MARKER = 'CXCallObserver dismiss ringing'
if (!callManager.includes(CALL_OBSERVER_MARKER)) {
  if (callManager.includes('func cancelAllIncomingCalls()')) {
    callManager = callManager.replace(
      `    func cancelAllIncomingCalls() {
        // cancelAllIncomingCalls
        let incomingIds = activeCalls.filter { !$0.value.isOutgoing }.map { $0.key }
        for uuid in incomingIds {
            cancelIncomingCall(uuid: uuid)
        }
    }`,
      `    func cancelAllIncomingCalls() {
        // cancelAllIncomingCalls
        let incomingIds = activeCalls.filter { !$0.value.isOutgoing }.map { $0.key }
        for uuid in incomingIds {
            cancelIncomingCall(uuid: uuid)
        }
    }

    func dismissAllRingingIncomingCalls() {
        // ${CALL_OBSERVER_MARKER}
        let observer = CXCallObserver()
        for call in observer.calls where !call.hasEnded && !call.isOutgoing && !call.hasConnected {
            cancelIncomingCall(uuid: call.uuid)
        }
        cancelAllIncomingCalls()
    }`,
    )
  } else {
    callManager = callManager.replace(
      `    // MARK: - End Call
    func endCall(uuid: UUID) {`,
      `    func dismissAllRingingIncomingCalls() {
        // ${CALL_OBSERVER_MARKER}
        let observer = CXCallObserver()
        for call in observer.calls where !call.hasEnded && !call.isOutgoing && !call.hasConnected {
            cancelIncomingCall(uuid: call.uuid)
        }
        cancelAllIncomingCalls()
    }

    // MARK: - End Call
    func endCall(uuid: UUID) {`,
    )
  }
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] added CXCallObserver dismiss for lock-screen cancel')
}

const CANCEL_UNANSWERED_MARKER = 'remoteEnded reason unanswered incoming'
if (callManager.includes(CANCEL_MARKER) && !callManager.includes(CANCEL_UNANSWERED_MARKER)) {
  callManager = callManager.replace(
    `    func cancelIncomingCall(uuid: UUID) {
        // CXEndCallAction cancel remote ring
        activeCalls.removeValue(forKey: uuid)
        provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        let endCallAction = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: endCallAction)) { _ in }
    }`,
    `    func cancelIncomingCall(uuid: UUID) {
        // CXEndCallAction cancel remote ring / ${CANCEL_UNANSWERED_MARKER}
        activeCalls.removeValue(forKey: uuid)
        provider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
        let endCallAction = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: endCallAction)) { _ in }
    }`,
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] use unanswered reason when dismissing incoming ring')
}

const DISMISS_V4_MARKER = 'dismissAllRingingIncomingCalls'
if (pluginSwift.includes('dismissRemoteVoipCancel') && !pluginSwift.includes(DISMISS_V4_MARKER) && !pluginSwift.includes(REQUEST_BRIDGE_DISMISS) && !pluginSwift.includes(DISMISS_FINAL)) {
  pluginSwift = pluginSwift.replace(
    /    internal func dismissRemoteVoipCancel\(callIdString: String\) \{[\s\S]*?\n    \}\n\n    private func pollCallStatus/,
    `    internal func dismissRemoteVoipCancel(callIdString: String) {
        // ${DISMISS_V4_MARKER}
        let normalized = callIdString.lowercased()
        stopCallStatusPolling(callId: normalized)
        if let uuid = UUID(uuidString: normalized) {
            callManager?.cancelIncomingCall(uuid: uuid)
        }
        callManager?.dismissAllRingingIncomingCalls()
    }

    private func pollCallStatus`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] dismiss all ringing CallKit calls on remote cancel')
}

if (pluginSwift.includes('private func pollCallStatus') && pluginSwift.includes(DISMISS_V4_MARKER)) {
  pluginSwift = pluginSwift.replace(
    `            DispatchQueue.main.async {
                if status != "active" {
                    if let uuid = UUID(uuidString: callId) {
                        self.callManager?.cancelIncomingCall(uuid: uuid)
                    } else {
                        self.callManager?.cancelAllIncomingCalls()
                    }
                }
                completion(false)
            }`,
    `            DispatchQueue.main.async {
                if status != "active" {
                    if let uuid = UUID(uuidString: callId) {
                        self.callManager?.cancelIncomingCall(uuid: uuid)
                    }
                    self.callManager?.dismissAllRingingIncomingCalls()
                }
                completion(false)
            }`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] poll fallback dismisses all ringing CallKit calls')
}

const BRIDGE_V1 = 'AiMediaTank VoipPushBridge'
if (pluginSwift && !pluginSwift.includes(BRIDGE_V1)) {
  pluginSwift = pluginSwift.replace(
    /\n        \/\/ AiMediaTank earlyPushKitRegistry[\s\S]*?\n        \}\n\n        NotificationCenter/,
    '\n        NotificationCenter',
  )

  pluginSwift = pluginSwift.replace(
    `@objc func registerVoipNotifications(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.voipRegistry = PKPushRegistry(queue: DispatchQueue.main)
            self.voipRegistry?.delegate = self
            self.voipRegistry?.desiredPushTypes = [.voIP]

            call.resolve()
        }
    }`,
    `@objc func registerVoipNotifications(_ call: CAPPluginCall) {
        // ${BRIDGE_V1}: PushKit is registered at app launch in AppDelegate.
        call.resolve()
    }`,
  )

  pluginSwift = pluginSwift.replace(
    `        callManager = CallManager(plugin: self)

        NotificationCenter.default.addObserver(`,
    `        callManager = CallManager(plugin: self)

        // ${BRIDGE_V1}
        NotificationCenter.default.addObserver(self, selector: #selector(handleBridgedVoipPushToken(_:)), name: NSNotification.Name("AiMediaTankVoipPushToken"), object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handleBridgedVoipIncomingPush(_:)), name: NSNotification.Name("AiMediaTankVoipIncomingPush"), object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handleBridgedVoipCancelPush(_:)), name: NSNotification.Name("AiMediaTankVoipCancelPush"), object: nil)

        NotificationCenter.default.addObserver(`,
  )

  pluginSwift = pluginSwift.replace(
    `    // Backward-compatible helper used by CallManager.
    internal func notifyListeners(event: String, data: [String: Any]) {
        emitEvent(event, data: data)
    }
}`,
    `    // Backward-compatible helper used by CallManager.
    internal func notifyListeners(event: String, data: [String: Any]) {
        emitEvent(event, data: data)
    }

    // ${BRIDGE_V1} — incoming VoIP forwarded from AiMediaTankVoipPushBridge
    @objc private func handleBridgedVoipPushToken(_ notification: Notification) {
        guard let tokenData = notification.object as? Data else { return }
        let token = tokenData.map { String(format: "%02x", $0) }.joined()
        emitEvent("voipPushToken", data: ["token": token])
    }

    @objc private func handleBridgedVoipCancelPush(_ notification: Notification) {
        // AiMediaTankVoipCancelPush
        guard let callId = notification.userInfo?["callId"] as? String else { return }
        dismissRemoteVoipCancel(callIdString: callId)
    }

    @objc private func handleBridgedVoipIncomingPush(_ notification: Notification) {
        guard let userInfo = notification.userInfo else {
            NotificationCenter.default.post(name: NSNotification.Name("AiMediaTankVoipIncomingPushDone"), object: nil)
            return
        }
        var payloadDict: [String: Any] = [:]
        for (key, value) in userInfo {
            payloadDict[String(describing: key)] = value
        }
        processIncomingVoipPushPayload(payloadDict)
    }

    private func processIncomingVoipPushPayload(_ payloadDict: [AnyHashable: Any]) {
        defer {
            NotificationCenter.default.post(name: NSNotification.Name("AiMediaTankVoipIncomingPushDone"), object: nil)
        }

        guard let callIdString = voipPayloadString(payloadDict, key: "callId"),
              let callId = UUID(uuidString: callIdString),
              let handle = voipPayloadString(payloadDict, key: "handle"),
              let displayName = voipPayloadString(payloadDict, key: "displayName") else {
            return
        }

        let handleTypeString = voipPayloadString(payloadDict, key: "handleType") ?? "generic"
        let video = payloadDict["video"] as? Bool ?? false

        let handleType: CXHandle.HandleType = {
            switch handleTypeString {
            case "phone": return .phoneNumber
            case "email": return .emailAddress
            default: return .generic
            }
        }()

        let declineToken = (payloadDict["metadata"] as? [String: Any])?["declineToken"] as? String
        let pollCallId = callIdString.lowercased()

        callManager?.reportIncomingCall(
            uuid: callId,
            handle: handle,
            displayName: displayName,
            handleType: handleType,
            video: video,
            declineToken: declineToken
        ) { [weak self] error in
            if error == nil {
                NotificationCenter.default.post(name: NSNotification.Name("AiMediaTankNoteIncomingCall"), object: nil, userInfo: ["callId": pollCallId])
                if let token = declineToken {
                    self?.startCallStatusPolling(callId: pollCallId, token: token)
                }
            }
            if let error {
                print("Error reporting incoming call: \\(error.localizedDescription)")
            }
        }

        var notificationData: [String: Any] = [
            "callId": callIdString,
            "handle": handle,
            "displayName": displayName,
            "handleType": handleTypeString,
            "video": video,
        ]

        if let metadata = payloadDict["metadata"] as? [String: Any] {
            notificationData["metadata"] = metadata
        }

        if alreadyReported || (payloadDict["callKitOnly"] as? Bool) == true {
            notificationData["callKitOnly"] = true
        }

        emitEvent("incomingCall", data: notificationData)
    }
}`,
  )

  pluginSwift = pluginSwift.replace(
    /\/\/ MARK: - PKPushRegistryDelegate\nextension CapacitorVoipCallsPlugin: PKPushRegistryDelegate \{[\s\S]*?\n\}\n\n/,
    '',
  )

  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] route VoIP pushes through AppDelegate bridge')
}

const BRIDGE_V2 = 'payloadDict String Any conversion'
if (pluginSwift.includes(BRIDGE_V1) && !pluginSwift.includes(BRIDGE_V2)) {
  pluginSwift = pluginSwift.replace(
    `@objc private func handleBridgedVoipIncomingPush(_ notification: Notification) {
        guard let payloadDict = notification.userInfo else {
            NotificationCenter.default.post(name: NSNotification.Name("AiMediaTankVoipIncomingPushDone"), object: nil)
            return
        }
        processIncomingVoipPushPayload(payloadDict)
    }`,
    `@objc private func handleBridgedVoipIncomingPush(_ notification: Notification) {
        guard let userInfo = notification.userInfo else {
            NotificationCenter.default.post(name: NSNotification.Name("AiMediaTankVoipIncomingPushDone"), object: nil)
            return
        }
        // ${BRIDGE_V2}
        var payloadDict: [String: Any] = [:]
        for (key, value) in userInfo {
            payloadDict[String(describing: key)] = value
        }
        processIncomingVoipPushPayload(payloadDict)
    }`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] fix bridged VoIP payload dictionary types')
}

const CANCEL_V5_MARKER = 'deactivate audio on remote cancel'
if (callManager.includes(CANCEL_MARKER) && !callManager.includes(CANCEL_V5_MARKER)) {
  callManager = callManager.replace(
    `    func cancelIncomingCall(uuid: UUID) {
        // CXEndCallAction cancel remote ring / remoteEnded reason unanswered incoming
        activeCalls.removeValue(forKey: uuid)
        provider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)
        let endCallAction = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: endCallAction)) { _ in }
    }`,
    `    func cancelIncomingCall(uuid: UUID) {
        // CXEndCallAction cancel remote ring / ${CANCEL_V5_MARKER}
        activeCalls.removeValue(forKey: uuid)
        provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)
        let endCallAction = CXEndCallAction(call: uuid)
        callController.request(CXTransaction(action: endCallAction)) { _ in }
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }`,
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] deactivate audio session when dismissing ring')
}

const BRIDGE_V2_MARKER = 'AnyHashable voip push payload'
if (pluginSwift && pluginSwift.includes('processIncomingVoipPushPayload') && !pluginSwift.includes(BRIDGE_V2_MARKER)) {
  pluginSwift = pluginSwift.replace(
    'private func processIncomingVoipPushPayload(_ payloadDict: [String: Any]) {',
    `private func processIncomingVoipPushPayload(_ payloadDict: [AnyHashable: Any]) { // ${BRIDGE_V2_MARKER}`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] fix VoIP push payload type for Notification.userInfo')
}

callManager = fs.readFileSync(callManagerPath, 'utf8')
const END_CALL_REPORT_MARKER = 'reportCall ended on CXEndCallAction'
if (callManager.includes('func provider(_ provider: CXProvider, perform action: CXEndCallAction)') && !callManager.includes(END_CALL_REPORT_MARKER)) {
  callManager = callManager.replace(
    `        plugin?.notifyListeners(event: "callEnded", data: ["callId": action.callUUID.uuidString])

        action.fulfill()
    }`,
    `        plugin?.notifyListeners(event: "callEnded", data: ["callId": action.callUUID.uuidString])

        // ${END_CALL_REPORT_MARKER}
        provider.reportCall(with: action.callUUID, endedAt: Date(), reason: .remoteEnded)
        action.fulfill()
    }`,
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] report call ended when fulfilling CXEndCallAction')
}

const BRIDGE_V3 = 'AiMediaTankVoipCancelPush'
if (pluginSwift && pluginSwift.includes(BRIDGE_V1) && !pluginSwift.includes(BRIDGE_V3)) {
  pluginSwift = pluginSwift.replace(
    `NotificationCenter.default.addObserver(self, selector: #selector(handleBridgedVoipIncomingPush(_:)), name: NSNotification.Name("AiMediaTankVoipIncomingPush"), object: nil)

        NotificationCenter.default.addObserver(`,
    `NotificationCenter.default.addObserver(self, selector: #selector(handleBridgedVoipIncomingPush(_:)), name: NSNotification.Name("AiMediaTankVoipIncomingPush"), object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handleBridgedVoipCancelPush(_:)), name: NSNotification.Name("AiMediaTankVoipCancelPush"), object: nil)

        NotificationCenter.default.addObserver(`,
  )
  pluginSwift = pluginSwift.replace(
    `    @objc private func handleBridgedVoipIncomingPush(_ notification: Notification) {`,
    `    @objc private func handleBridgedVoipCancelPush(_ notification: Notification) {
        // ${BRIDGE_V3}
        guard let callId = notification.userInfo?["callId"] as? String else { return }
        dismissRemoteVoipCancel(callIdString: callId)
    }

    @objc private func handleBridgedVoipIncomingPush(_ notification: Notification) {`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] forward cancel VoIP push to CallManager provider')
}

const CANCEL_OBSERVER_MARKER = 'CallManager observes VoIP cancel push'
if (callManager.includes('provider.setDelegate(self, queue: nil)') && !callManager.includes(CANCEL_OBSERVER_MARKER)) {
  callManager = callManager.replace(
    '        provider.setDelegate(self, queue: nil)\n    }',
    `        provider.setDelegate(self, queue: DispatchQueue.main)

        NotificationCenter.default.addObserver(
            forName: NSNotification.Name("AiMediaTankVoipCancelPush"),
            object: nil,
            queue: .main
        ) { [weak self] note in
            guard let self = self,
                  let callId = note.userInfo?["callId"] as? String else { return }
            let normalized = callId.lowercased()
            // ${CANCEL_OBSERVER_MARKER}
            if let uuid = UUID(uuidString: normalized) {
                self.cancelIncomingCall(uuid: uuid)
            }
            self.dismissAllRingingIncomingCalls()
        }
    }`,
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] CallManager listens for VoIP cancel push')
}

const SKIP_CANCELLED_MARKER = 'skip incoming VoIP when caller already cancelled'
if (pluginSwift && pluginSwift.includes('processIncomingVoipPushPayload') && !pluginSwift.includes(SKIP_CANCELLED_MARKER)) {
  pluginSwift = pluginSwift.replace(
    `        guard let callIdString = voipPayloadString(payloadDict, key: "callId"),
              let callId = UUID(uuidString: callIdString),
              let handle = voipPayloadString(payloadDict, key: "handle"),
              let displayName = voipPayloadString(payloadDict, key: "displayName") else {
            return
        }`,
    `        guard let callIdString = voipPayloadString(payloadDict, key: "callId"),
              let callId = UUID(uuidString: callIdString),
              let handle = voipPayloadString(payloadDict, key: "handle"),
              let displayName = voipPayloadString(payloadDict, key: "displayName") else {
            return
        }

        // ${SKIP_CANCELLED_MARKER}
        let cancelledIds = UserDefaults.standard.stringArray(forKey: "AiMediaTank.cancelledCallIds") ?? []
        if cancelledIds.contains(callIdString.lowercased()) {
            return
        }`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] skip CallKit report for already-cancelled calls')
}

const VOICE_API_BASE_MARKER = 'voice API base from capacitor.config.json'
if (pluginSwift && pluginSwift.includes('syncCallDeclineToServer') && !pluginSwift.includes(VOICE_API_BASE_MARKER)) {
  pluginSwift = pluginSwift.replace(
    '    // AiMediaTank syncCallDeclineToServer',
    `    // ${VOICE_API_BASE_MARKER}
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

    // AiMediaTank syncCallDeclineToServer`,
  )
  pluginSwift = pluginSwift.replace(
    'guard let url = URL(string: "https://aimediatank.com/api/chat/voice/native-decline")',
    'guard let url = URL(string: "\\(voiceApiBaseURL())/api/chat/voice/native-decline")',
  )
  pluginSwift = pluginSwift.replace(
    'URLComponents(string: "https://aimediatank.com/api/chat/voice/native-status")!',
    'URLComponents(string: "\\(voiceApiBaseURL())/api/chat/voice/native-status")!',
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] use Capacitor server URL for native voice API')
}

callManager = fs.readFileSync(callManagerPath, 'utf8')
const REMOTE_CANCEL_DECLINE_MARKER = 'skip decline sync on remote cancel'
if (callManager.includes('syncCallDeclineToServer') && !callManager.includes(REMOTE_CANCEL_DECLINE_MARKER)) {
  callManager = callManager.replace(
    `        if let endedCall, !endedCall.isOutgoing, let token = endedCall.declineToken {
            plugin?.syncCallDeclineToServer(callId: action.callUUID.uuidString.lowercased(), token: token)
        }`,
    `        // ${REMOTE_CANCEL_DECLINE_MARKER}
        let normalizedCallId = action.callUUID.uuidString.lowercased()
        let remoteCancelled = UserDefaults.standard.stringArray(forKey: "AiMediaTank.cancelledCallIds")?
            .contains(normalizedCallId) ?? false
        if let endedCall, !endedCall.isOutgoing, let token = endedCall.declineToken, !remoteCancelled {
            plugin?.syncCallDeclineToServer(callId: normalizedCallId, token: token)
        }`,
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] skip native-decline when caller cancelled remotely')
}

const TRACK_INCOMING_MARKER = 'trackBridgedIncomingCall'
if (!callManager.includes(TRACK_INCOMING_MARKER)) {
  callManager = callManager.replace(
    `    // MARK: - Report Incoming Call
    func reportIncomingCall(uuid: UUID, handle: String, displayName: String, handleType: CXHandle.HandleType, video: Bool, declineToken: String? = nil, completion: @escaping (Error?) -> Void) {`,
    `    // MARK: - Track Incoming Call (${TRACK_INCOMING_MARKER})
    func trackIncomingCall(uuid: UUID, handle: String, displayName: String, declineToken: String? = nil) {
        var call = Call(uuid: uuid, handle: handle, displayName: displayName, isOutgoing: false)
        call.declineToken = declineToken
        activeCalls[uuid] = call
    }

    // MARK: - Report Incoming Call
    func reportIncomingCall(uuid: UUID, handle: String, displayName: String, handleType: CXHandle.HandleType, video: Bool, declineToken: String? = nil, completion: @escaping (Error?) -> Void) {`,
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] add trackIncomingCall for AppDelegate CallKit bridge')
}

const FINALIZE_BRIDGE_END_MARKER = 'finalizeBridgedCallEnd'
if (!callManager.includes(FINALIZE_BRIDGE_END_MARKER)) {
  callManager = callManager.replace(
    `    func dismissAllRingingIncomingCalls() {`,
    `    func finalizeBridgedCallEnd(callId: String) {
        // ${FINALIZE_BRIDGE_END_MARKER}
        guard let uuid = UUID(uuidString: callId.lowercased()) else { return }
        let normalized = callId.lowercased()
        let remoteCancelled = UserDefaults.standard.stringArray(forKey: "AiMediaTank.cancelledCallIds")?
            .contains(normalized) ?? false
        if let call = activeCalls[uuid], !call.isOutgoing, let token = call.declineToken, !remoteCancelled {
            plugin?.syncCallDeclineToServer(callId: normalized, token: token)
        }
        activeCalls.removeValue(forKey: uuid)
    }

    func dismissAllRingingIncomingCalls() {`,
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] sync decline on bridge CallKit end')
}

if (pluginSwift && pluginSwift.includes('processIncomingVoipPushPayload') && !pluginSwift.includes('reportedToCallKit')) {
  pluginSwift = pluginSwift.replace(
    `        let declineToken = (payloadDict["metadata"] as? [String: Any])?["declineToken"] as? String
        let pollCallId = callIdString.lowercased()

        callManager?.reportIncomingCall(
            uuid: callId,
            handle: handle,
            displayName: displayName,
            handleType: handleType,
            video: video,
            declineToken: declineToken
        ) { [weak self] error in
            if error == nil {
                NotificationCenter.default.post(name: NSNotification.Name("AiMediaTankNoteIncomingCall"), object: nil, userInfo: ["callId": pollCallId])
                if let token = declineToken {
                    self?.startCallStatusPolling(callId: pollCallId, token: token)
                }
            }
            if let error {
                print("Error reporting incoming call: \\(error.localizedDescription)")
            }
        }`,
    `        let declineToken = (payloadDict["metadata"] as? [String: Any])?["declineToken"] as? String
        let pollCallId = callIdString.lowercased()
        let alreadyReported = (payloadDict["reportedToCallKit"] as? Bool) ?? false

        if alreadyReported {
            callManager?.trackIncomingCall(uuid: callId, handle: handle, displayName: displayName, declineToken: declineToken)
            NotificationCenter.default.post(name: NSNotification.Name("AiMediaTankNoteIncomingCall"), object: nil, userInfo: ["callId": pollCallId])
            if let token = declineToken {
                startCallStatusPolling(callId: pollCallId, token: token)
            }
        } else {
            callManager?.reportIncomingCall(
                uuid: callId,
                handle: handle,
                displayName: displayName,
                handleType: handleType,
                video: video,
                declineToken: declineToken
            ) { [weak self] error in
                if error == nil {
                    NotificationCenter.default.post(name: NSNotification.Name("AiMediaTankNoteIncomingCall"), object: nil, userInfo: ["callId": pollCallId])
                    if let token = declineToken {
                        self?.startCallStatusPolling(callId: pollCallId, token: token)
                    }
                }
                if let error {
                    print("Error reporting incoming call: \\(error.localizedDescription)")
                }
            }
        }`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] skip duplicate CallKit report when App bridge already reported')
}

const BRIDGE_CALLKIT_EVENTS = 'AiMediaTankCallKitAnswer'
if (pluginSwift && pluginSwift.includes(BRIDGE_V1) && !pluginSwift.includes(BRIDGE_CALLKIT_EVENTS)) {
  pluginSwift = pluginSwift.replace(
    `        NotificationCenter.default.addObserver(self, selector: #selector(handleBridgedVoipCancelPush(_:)), name: NSNotification.Name("AiMediaTankVoipCancelPush"), object: nil)

        NotificationCenter.default.addObserver(`,
    `        NotificationCenter.default.addObserver(self, selector: #selector(handleBridgedVoipCancelPush(_:)), name: NSNotification.Name("AiMediaTankVoipCancelPush"), object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handleBridgedCallKitAnswer(_:)), name: NSNotification.Name("AiMediaTankCallKitAnswer"), object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handleBridgedCallKitEnd(_:)), name: NSNotification.Name("AiMediaTankCallKitEnd"), object: nil)

        NotificationCenter.default.addObserver(`,
  )
  pluginSwift = pluginSwift.replace(
    `    @objc private func handleBridgedVoipCancelPush(_ notification: Notification) {`,
    `    @objc private func handleBridgedCallKitAnswer(_ notification: Notification) {
        guard let callId = notification.userInfo?["callId"] as? String else { return }
        stopCallStatusPolling(callId: callId)
        emitEvent("callAnswered", data: ["callId": callId])
    }

    @objc private func handleBridgedCallKitEnd(_ notification: Notification) {
        guard let callId = notification.userInfo?["callId"] as? String else { return }
        stopCallStatusPolling(callId: callId)
        callManager?.finalizeBridgedCallEnd(callId: callId)
        emitEvent("callEnded", data: ["callId": callId])
    }

    @objc private func handleBridgedVoipCancelPush(_ notification: Notification) {`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] forward App bridge CallKit answer/end to JS')
}

const DISMISS_V5_MARKER = 'bridge owns PushKit call dismiss'
if (pluginSwift && pluginSwift.includes('dismissRemoteVoipCancel') && !pluginSwift.includes(DISMISS_V5_MARKER) && !pluginSwift.includes(REQUEST_BRIDGE_DISMISS)) {
  pluginSwift = pluginSwift.replace(
    /    internal func dismissRemoteVoipCancel\(callIdString: String\) \{[\s\S]*?\n    \}\n\n    private func pollCallStatus/,
    `    internal func dismissRemoteVoipCancel(callIdString: String) {
        // ${DISMISS_V5_MARKER}
        let normalized = callIdString.lowercased()
        stopCallStatusPolling(callId: normalized)
        callManager?.finalizeBridgedCallEnd(callId: normalized)
    }

    private func pollCallStatus`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] let App bridge dismiss CallKit for cancel push')
}

const UNANSWERED_DISMISS_MARKER = 'unanswered dismiss remote ring'
if (callManager.includes(CANCEL_V5_MARKER) && !callManager.includes(UNANSWERED_DISMISS_MARKER)) {
  callManager = callManager.replace(
    `    func cancelIncomingCall(uuid: UUID) {
        // CXEndCallAction cancel remote ring / deactivate audio on remote cancel
        activeCalls.removeValue(forKey: uuid)
        provider.reportCall(with: uuid, endedAt: Date(), reason: .remoteEnded)`,
    `    func cancelIncomingCall(uuid: UUID) {
        // CXEndCallAction cancel remote ring / ${UNANSWERED_DISMISS_MARKER}
        activeCalls.removeValue(forKey: uuid)
        provider.reportCall(with: uuid, endedAt: Date(), reason: .unanswered)`,
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] use unanswered reason to stop incoming ring')
}

const BRIDGE_OWNS_CANCEL = 'bridge owns cancel dismiss'
if (callManager.includes('CallManager observes VoIP cancel push') && !callManager.includes(BRIDGE_OWNS_CANCEL)) {
  callManager = callManager.replace(
    `            // CallManager observes VoIP cancel push
            if let uuid = UUID(uuidString: normalized) {
                self.cancelIncomingCall(uuid: uuid)
            }
            self.dismissAllRingingIncomingCalls()`,
    `            // ${BRIDGE_OWNS_CANCEL} — App bridge CXProvider dismisses; sync plugin state only
            self.finalizeBridgedCallEnd(callId: normalized)`,
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] stop CallManager from dismissing bridge-owned CallKit calls')
}

const BRIDGE_STATUS_WATCH = 'AiMediaTankStartCallStatusWatch'
if (pluginSwift && pluginSwift.includes('startCallStatusPolling') && !pluginSwift.includes(BRIDGE_STATUS_WATCH)) {
  pluginSwift = pluginSwift.replace(
    `    internal func startCallStatusPolling(callId: String, token: String) {
        // beginBackgroundTask call status watch
        stopCallStatusPolling(callId: callId)`,
    `    internal func startCallStatusPolling(callId: String, token: String) {
        // ${BRIDGE_STATUS_WATCH}
        NotificationCenter.default.post(
            name: NSNotification.Name("AiMediaTankStartCallStatusWatch"),
            object: nil,
            userInfo: ["callId": callId, "token": token]
        )
        // beginBackgroundTask call status watch
        stopCallStatusPolling(callId: callId)`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] mirror status polling to App bridge')
}

if (pluginSwift && pluginSwift.includes(BRIDGE_V1) && !pluginSwift.includes(REQUEST_BRIDGE_DISMISS)) {
  pluginSwift = pluginSwift.replace(
    '    // AiMediaTank syncCallDeclineToServer',
    `    internal func requestBridgeDismiss(callId: String) {
        // ${REQUEST_BRIDGE_DISMISS}
        NotificationCenter.default.post(
            name: NSNotification.Name("AiMediaTankRequestBridgeDismiss"),
            object: nil,
            userInfo: ["callId": callId.lowercased()]
        )
    }

    // AiMediaTank syncCallDeclineToServer`,
  )

  pluginSwift = pluginSwift.replace(
    /    internal func dismissRemoteVoipCancel\(callIdString: String\) \{[\s\S]*?\n    \}\n\n    private func pollCallStatus/,
    `    internal func dismissRemoteVoipCancel(callIdString: String) {
        let normalized = callIdString.lowercased()
        stopCallStatusPolling(callId: normalized)
        let alreadyCancelled = UserDefaults.standard.stringArray(forKey: "AiMediaTank.cancelledCallIds")?
            .contains(normalized) ?? false
        if !alreadyCancelled {
            requestBridgeDismiss(callId: normalized)
        }
        callManager?.finalizeBridgedCallEnd(callId: normalized)
    }

    private func pollCallStatus`,
  )

  pluginSwift = pluginSwift.replace(
    `            DispatchQueue.main.async {
                if status != "active" {
                    if let uuid = UUID(uuidString: callId) {
                        self.callManager?.cancelIncomingCall(uuid: uuid)
                    }
                    self.callManager?.dismissAllRingingIncomingCalls()
                }
                completion(false)
            }`,
    `            DispatchQueue.main.async {
                if status != "active" {
                    self.requestBridgeDismiss(callId: callId)
                }
                completion(false)
            }`,
  )

  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] route all CallKit dismiss through App bridge provider')
}

const BRIDGE_TRACK_ONLY = 'bridged VoIP track-only handler'
if (pluginSwift && pluginSwift.includes('handleBridgedVoipIncomingPush') && !pluginSwift.includes(BRIDGE_TRACK_ONLY)) {
  pluginSwift = pluginSwift.replace(
    /@objc private func handleBridgedVoipIncomingPush\(_ notification: Notification\) \{[\s\S]*?\n    \}\n\n    private func processIncomingVoipPushPayload/,
    `@objc private func handleBridgedVoipIncomingPush(_ notification: Notification) {
        // ${BRIDGE_TRACK_ONLY}: App bridge already reported this call to CallKit.
        defer {
            NotificationCenter.default.post(name: NSNotification.Name("AiMediaTankVoipIncomingPushDone"), object: nil)
        }
        guard let userInfo = notification.userInfo else { return }

        var payloadDict: [String: Any] = [:]
        for (key, value) in userInfo {
            payloadDict[String(describing: key)] = value
        }

        guard let callIdString = voipPayloadString(payloadDict as [AnyHashable: Any], key: "callId"),
              let callId = UUID(uuidString: callIdString),
              let handle = voipPayloadString(payloadDict as [AnyHashable: Any], key: "handle"),
              let displayName = voipPayloadString(payloadDict as [AnyHashable: Any], key: "displayName") else {
            return
        }

        let cancelledIds = UserDefaults.standard.stringArray(forKey: "AiMediaTank.cancelledCallIds") ?? []
        if cancelledIds.contains(callIdString.lowercased()) { return }

        let declineToken = voipPayloadString(payloadDict as [AnyHashable: Any], key: "declineToken")
            ?? (payloadDict["metadata"] as? [String: Any])?["declineToken"] as? String
        let pollCallId = callIdString.lowercased()

        callManager?.trackIncomingCall(uuid: callId, handle: handle, displayName: displayName, declineToken: declineToken)

        if let token = declineToken {
            startCallStatusPolling(callId: pollCallId, token: token)
        }

        var notificationData: [String: Any] = [
            "callId": callIdString,
            "handle": handle,
            "displayName": displayName,
            "handleType": voipPayloadString(payloadDict as [AnyHashable: Any], key: "handleType") ?? "generic",
            "video": payloadDict["video"] as? Bool ?? false,
        ]
        if let metadata = payloadDict["metadata"] as? [String: Any] {
            notificationData["metadata"] = metadata
        }
        emitEvent("incomingCall", data: notificationData)
    }

    private func processIncomingVoipPushPayload`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] never double-report CallKit for bridged VoIP pushes')
}

if (pluginSwift && pluginSwift.includes(REQUEST_BRIDGE_DISMISS) && pluginSwift.includes('dismissRemoteVoipCancel') && !pluginSwift.includes(DISMISS_FINAL)) {
  pluginSwift = pluginSwift.replace(
    /    internal func dismissRemoteVoipCancel\(callIdString: String\) \{[\s\S]*?\n    \}\n\n    private func pollCallStatus/,
    `    internal func dismissRemoteVoipCancel(callIdString: String) {
        let normalized = callIdString.lowercased()
        stopCallStatusPolling(callId: normalized)
        // ${DISMISS_FINAL}
        let alreadyCancelled = UserDefaults.standard.stringArray(forKey: "AiMediaTank.cancelledCallIds")?
            .contains(normalized) ?? false
        if !alreadyCancelled {
            requestBridgeDismiss(callId: normalized)
        }
        callManager?.finalizeBridgedCallEnd(callId: normalized)
    }

    private func pollCallStatus`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] route cancel dismiss through bridge provider')
}

const AUDIO_RELEASE_MARKER = 'releaseAudioSession notifyOthersOnDeactivation'
if (callManager.includes('configureAudioSession') && !callManager.includes(AUDIO_RELEASE_MARKER)) {
  callManager = callManager.replace(
    `    // MARK: - Configure Audio Session
    private func configureAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP])
            try audioSession.setActive(true)
        } catch {
            print("Failed to configure audio session: \\(error.localizedDescription)")
        }
    }`,
    `    // MARK: - Configure Audio Session
    private func configureAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [.allowBluetooth, .allowBluetoothA2DP])
        } catch {
            print("Failed to configure audio session: \\(error.localizedDescription)")
        }
    }

    private func releaseAudioSession() {
        // ${AUDIO_RELEASE_MARKER}
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }`,
  )

  callManager = callManager.replace(
    `        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    func cancelAllIncomingCalls()`,
    `        releaseAudioSession()
    }

    func cancelAllIncomingCalls()`,
  )

  callManager = callManager.replace(
    `    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        configureAudioSession()
        // stopCallStatusPolling on CallKit action`,
    `    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        // stopCallStatusPolling on CallKit action`,
  )

  callManager = callManager.replace(
    `    func providerDidReset(_ provider: CXProvider) {
        activeCalls.removeAll()
    }`,
    `    func providerDidReset(_ provider: CXProvider) {
        activeCalls.removeAll()
        releaseAudioSession()
    }`,
  )

  callManager = callManager.replace(
    `        // reportCall ended on CXEndCallAction
        provider.reportCall(with: action.callUUID, endedAt: Date(), reason: .remoteEnded)
        action.fulfill()
    }`,
    `        // reportCall ended on CXEndCallAction
        provider.reportCall(with: action.callUUID, endedAt: Date(), reason: .remoteEnded)
        action.fulfill()
        releaseAudioSession()
    }`,
  )

  callManager = callManager.replace(
    `    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        print("Audio session activated")
        // Start your audio processing here
    }
    
    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        print("Audio session deactivated")
        // Stop your audio processing here
    }`,
    `    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        configureAudioSession()
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        releaseAudioSession()
    }`,
  )

  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] release audio session on call end and CallKit reset')
}

const JS_INCOMING_TRACK_ONLY = 'skip duplicate CallKit report from JS handleIncomingCall'
if (pluginSwift && pluginSwift.includes('handleIncomingCall') && !pluginSwift.includes(JS_INCOMING_TRACK_ONLY)) {
  pluginSwift = pluginSwift.replace(
    `        callManager?.reportIncomingCall(
            uuid: callId,
            handle: handle,
            displayName: displayName,
            handleType: handleType,
            video: video
        ) { error in
            if let error {
                call.reject("Failed to report incoming call: \\(error.localizedDescription)")
                return
            }

            var notificationData: [String: Any] = [
                "callId": callIdString,
                "handle": handle,
                "displayName": displayName,
                "handleType": handleTypeString,
                "video": video,
            ]
            if let metadata {
                notificationData["metadata"] = metadata
            }
            self.emitEvent("incomingCall", data: notificationData)
            call.resolve(["callId": callIdString])
        }`,
    `        // ${JS_INCOMING_TRACK_ONLY}
        let normalizedCallId = callIdString.lowercased()
        let alreadyOnCallKit = UserDefaults.standard.stringArray(forKey: "AiMediaTank.ringingCallIds")?
            .contains(normalizedCallId) ?? false
        let pendingAnswer = UserDefaults.standard.string(forKey: "AiMediaTank.pendingCallKitAnswerCallId")?
            .lowercased() == normalizedCallId
        let callKitObserver = CXCallObserver()
        let hasBridgeCall = callKitObserver.calls.contains {
            !$0.hasEnded && $0.uuid.uuidString.lowercased() == normalizedCallId
        }
        let declineToken = metadata?["declineToken"] as? String

        func finishIncomingCall() {
            var notificationData: [String: Any] = [
                "callId": callIdString,
                "handle": handle,
                "displayName": displayName,
                "handleType": handleTypeString,
                "video": video,
            ]
            if let metadata {
                notificationData["metadata"] = metadata
            }
            self.emitEvent("incomingCall", data: notificationData)
            call.resolve(["callId": callIdString])
        }

        if alreadyOnCallKit || pendingAnswer || hasBridgeCall {
            callManager?.trackIncomingCall(
                uuid: callId,
                handle: handle,
                displayName: displayName,
                declineToken: declineToken
            )
            finishIncomingCall()
            return
        }

        callManager?.reportIncomingCall(
            uuid: callId,
            handle: handle,
            displayName: displayName,
            handleType: handleType,
            video: video,
            declineToken: declineToken
        ) { error in
            if let error {
                call.reject("Failed to report incoming call: \\(error.localizedDescription)")
                return
            }
            finishIncomingCall()
        }`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] avoid second CallKit ring from JS handleIncomingCall')
}

const BRIDGE_CONNECTED_MARKER = 'AiMediaTankReportCallConnected'
if (pluginSwift && pluginSwift.includes('updateCallStatus') && !pluginSwift.includes(BRIDGE_CONNECTED_MARKER)) {
  pluginSwift = pluginSwift.replace(
    `        callManager?.updateCallStatus(uuid: callId, status: status)
        call.resolve()`,
    `        callManager?.updateCallStatus(uuid: callId, status: status)
        if status == "connected" {
            NotificationCenter.default.post(
                name: NSNotification.Name("${BRIDGE_CONNECTED_MARKER}"),
                object: nil,
                userInfo: ["callId": callIdString.lowercased()]
            )
        }
        call.resolve()`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] forward connected status to App bridge CallKit provider')
}

const BRIDGE_ONLY_POLL = 'bridge-only status watch forwarding'
if (pluginSwift && pluginSwift.includes('startCallStatusPolling') && !pluginSwift.includes(BRIDGE_ONLY_POLL)) {
  pluginSwift = pluginSwift.replace(
    /    internal func startCallStatusPolling\(callId: String, token: String\) \{[\s\S]*?\n    \}\n\n    internal func stopCallStatusPolling/,
    `    internal func startCallStatusPolling(callId: String, token: String) {
        // ${BRIDGE_ONLY_POLL}
        NotificationCenter.default.post(
            name: NSNotification.Name("AiMediaTankStartCallStatusWatch"),
            object: nil,
            userInfo: ["callId": callId, "token": token]
        )
    }

    internal func stopCallStatusPolling`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] forward status watch to App bridge only (no duplicate poll)')
}

const PLUGIN_POLL_GRACE = 'status poll grace for ringing and active'
if (pluginSwift && pluginSwift.includes('private func pollCallStatus') && !pluginSwift.includes(PLUGIN_POLL_GRACE)) {
  pluginSwift = pluginSwift.replace(
    `            if status == "ringing" {
                completion(true)
                return
            }
            DispatchQueue.main.async {
                if status != "active" {
                    self.requestBridgeDismiss(callId: callId)
                }
                completion(false)
            }`,
    `            if status == "ringing" || status == "active" {
                completion(true)
                return
            }
            DispatchQueue.main.async {
                // ${PLUGIN_POLL_GRACE}
                self.requestBridgeDismiss(callId: callId)
                completion(false)
            }`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] treat active status as in-progress during poll')
}

const TOKEN_REPLAY_MARKER = 'AiMediaTank replay cached VoIP token'
if (pluginSwift && !pluginSwift.includes(TOKEN_REPLAY_MARKER)) {
  pluginSwift = pluginSwift.replace(
    `@objc func registerVoipNotifications(_ call: CAPPluginCall) {
        // ${BRIDGE_V1}: PushKit is registered at app launch in AppDelegate.
        call.resolve()
    }`,
    `@objc func registerVoipNotifications(_ call: CAPPluginCall) {
        // ${BRIDGE_V1}: PushKit is registered at app launch in AppDelegate.
        // ${TOKEN_REPLAY_MARKER}
        if let tokenHex = UserDefaults.standard.string(forKey: "AiMediaTank.voipPushTokenHex"),
           !tokenHex.isEmpty {
            emitEvent("voipPushToken", data: ["token": tokenHex])
        }
        call.resolve()
    }`,
  )
  if (!pluginSwift.includes(TOKEN_REPLAY_MARKER)) {
    pluginSwift = pluginSwift.replace(
      `@objc func registerVoipNotifications(_ call: CAPPluginCall) {
        // AiMediaTank VoipPushBridge: PushKit is registered at app launch in AppDelegate.
        call.resolve()
    }`,
      `@objc func registerVoipNotifications(_ call: CAPPluginCall) {
        // AiMediaTank VoipPushBridge: PushKit is registered at app launch in AppDelegate.
        // ${TOKEN_REPLAY_MARKER}
        if let tokenHex = UserDefaults.standard.string(forKey: "AiMediaTank.voipPushTokenHex"),
           !tokenHex.isEmpty {
            emitEvent("voipPushToken", data: ["token": tokenHex])
        }
        call.resolve()
    }`,
    )
  }
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] replay cached VoIP token on registerVoipNotifications')
}

const CALLKIT_ANSWER_DECLINE_TOKEN = 'forward declineToken on CallKit answer'
if (
  pluginSwift &&
  pluginSwift.includes('handleBridgedCallKitAnswer') &&
  !pluginSwift.includes(CALLKIT_ANSWER_DECLINE_TOKEN)
) {
  pluginSwift = pluginSwift.replace(
    /    @objc private func handleBridgedCallKitAnswer\(_ notification: Notification\) \{[\s\S]*?\n    \}\n\n    @objc private func handleBridgedCallKitEnd/,
    `    @objc private func handleBridgedCallKitAnswer(_ notification: Notification) {
        guard let callId = notification.userInfo?["callId"] as? String else { return }
        // ${CALLKIT_ANSWER_DECLINE_TOKEN}
        var data: [String: Any] = ["callId": callId]
        if let token = notification.userInfo?["declineToken"] as? String {
            data["declineToken"] = token
        }
        emitEvent("callAnswered", data: data)
    }

    @objc private func handleBridgedCallKitEnd`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] forward declineToken with CallKit answer to JS')
}

const DECLINE_TOKEN_USERDEFAULTS = 'declineToken from UserDefaults on CallKit answer'
if (
  pluginSwift &&
  pluginSwift.includes('handleBridgedCallKitAnswer') &&
  !pluginSwift.includes(DECLINE_TOKEN_USERDEFAULTS)
) {
  pluginSwift = pluginSwift.replace(
    /        if let token = notification\.userInfo\?\["declineToken"\] as\? String \{\n            data\["declineToken"\] = token\n        \}/,
    `        if let token = notification.userInfo?["declineToken"] as? String {
            data["declineToken"] = token
        } else if let token = UserDefaults.standard.string(forKey: "AiMediaTank.declineToken.\\(callId.lowercased())") {
            // ${DECLINE_TOKEN_USERDEFAULTS}
            data["declineToken"] = token
        }`,
  )
  if (pluginSwift.includes('notificationData["metadata"] = metadata') && !pluginSwift.includes('notificationData["declineToken"]')) {
    pluginSwift = pluginSwift.replace(
      `        if let metadata = payloadDict["metadata"] as? [String: Any] {
            notificationData["metadata"] = metadata
        }
        emitEvent("incomingCall", data: notificationData)`,
      `        if let metadata = payloadDict["metadata"] as? [String: Any] {
            notificationData["metadata"] = metadata
        }
        if let token = declineToken {
            notificationData["declineToken"] = token
        }
        emitEvent("incomingCall", data: notificationData)`,
    )
  }
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] UserDefaults declineToken fallback for CallKit answer')
}

const NO_DUPLICATE_PUSHKIT = 'bridge-only PushKit registry'
if (pluginSwift && pluginSwift.includes(EARLY_PUSHKIT_MARKER)) {
  const stripped = pluginSwift.replace(
    /\n        \/\/ AiMediaTank earlyPushKitRegistry[\s\S]*?\n        \}\n\n        NotificationCenter/,
    `\n        // ${NO_DUPLICATE_PUSHKIT} — AppDelegate AiMediaTankVoipPushBridge owns PushKit\n\n        NotificationCenter`,
  )
  if (stripped !== pluginSwift) {
    pluginSwift = stripped
    fs.writeFileSync(pluginSwiftPath, pluginSwift)
    console.log('[patch-voip-callkit] remove duplicate plugin PushKit registry')
  }
}

const TOP_LEVEL_DECLINE_TOKEN = 'declineToken from top-level VoIP payload'
if (
  pluginSwift &&
  pluginSwift.includes('processIncomingVoipPushPayload') &&
  !pluginSwift.includes(TOP_LEVEL_DECLINE_TOKEN)
) {
  pluginSwift = pluginSwift.replace(
    `        let declineToken = (payloadDict["metadata"] as? [String: Any])?["declineToken"] as? String`,
    `        let declineToken = voipPayloadString(payloadDict as [AnyHashable: Any], key: "declineToken")
            ?? (payloadDict["metadata"] as? [String: Any])?["declineToken"] as? String
            // ${TOP_LEVEL_DECLINE_TOKEN}`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] read declineToken from top-level VoIP payload')
}

const SESSION_WEBRTC_MARKER = 'useSessionWebRtc on CallKit answer'
if (
  pluginSwift &&
  pluginSwift.includes('handleBridgedCallKitAnswer') &&
  !pluginSwift.includes(SESSION_WEBRTC_MARKER)
) {
  pluginSwift = pluginSwift.replace(
    /(var data: \[String: Any\] = \["callId": callId\][\s\S]*?)(\n        emitEvent\("callAnswered", data: data\))/,
    `$1
        if let session = notification.userInfo?["useSessionWebRtc"] as? Bool {
            // ${SESSION_WEBRTC_MARKER}
            data["useSessionWebRtc"] = session
        }$2`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] forward useSessionWebRtc on CallKit answer to JS')
}

const NATIVE_WEBRTC_MARKER = 'nativeWebRtc on CallKit answer'
if (
  pluginSwift &&
  pluginSwift.includes('handleBridgedCallKitAnswer') &&
  !pluginSwift.includes(NATIVE_WEBRTC_MARKER)
) {
  pluginSwift = pluginSwift.replace(
    /(var data: \[String: Any\] = \["callId": callId\][\s\S]*?)(\n        emitEvent\("callAnswered", data: data\))/,
    `$1
        if let native = notification.userInfo?["nativeWebRtc"] as? Bool {
            // ${NATIVE_WEBRTC_MARKER}
            data["nativeWebRtc"] = native
        }$2`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] forward nativeWebRtc on CallKit answer to JS')
}

const PREPARE_UNLOCKED_MARKER = 'AiMediaTankPrepareUnlockedIncoming'
if (
  pluginSwift &&
  pluginSwift.includes('handleBridgedCallKitAnswer') &&
  !pluginSwift.includes(PREPARE_UNLOCKED_MARKER)
) {
  pluginSwift = pluginSwift.replace(
    `        NotificationCenter.default.addObserver(self, selector: #selector(handleBridgedCallKitEnd(_:)), name: NSNotification.Name("AiMediaTankCallKitEnd"), object: nil)`,
    `        NotificationCenter.default.addObserver(self, selector: #selector(handleBridgedCallKitEnd(_:)), name: NSNotification.Name("AiMediaTankCallKitEnd"), object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(handlePrepareUnlockedIncoming(_:)), name: NSNotification.Name("AiMediaTankPrepareUnlockedIncoming"), object: nil)`,
  )
  pluginSwift = pluginSwift.replace(
    `@objc private func handleBridgedCallKitEnd(_ notification: Notification) {`,
    `@objc private func handlePrepareUnlockedIncoming(_ notification: Notification) {
        guard let callId = notification.userInfo?["callId"] as? String else { return }
        var data: [String: Any] = ["callId": callId]
        if let token = notification.userInfo?["declineToken"] as? String {
            data["declineToken"] = token
        } else if let token = UserDefaults.standard.string(forKey: "AiMediaTank.declineToken.\\(callId.lowercased())") {
            // ${PREPARE_UNLOCKED_MARKER}
            data["declineToken"] = token
        }
        data["callKitOnly"] = true
        emitEvent("incomingCall", data: data)
    }

    @objc private func handleBridgedCallKitEnd(_ notification: Notification) {`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] refresh incoming on unlock before Accept/Decline')
}

const CALLKIT_ONLY_MARKER = 'callKitOnly on bridge-reported incoming'
if (
  pluginSwift &&
  pluginSwift.includes('let alreadyReported =') &&
  !pluginSwift.includes(CALLKIT_ONLY_MARKER)
) {
  pluginSwift = pluginSwift.replace(
    `        if let metadata = payloadDict["metadata"] as? [String: Any] {
            notificationData["metadata"] = metadata
        }

        emitEvent("incomingCall", data: notificationData)`,
    `        if let metadata = payloadDict["metadata"] as? [String: Any] {
            notificationData["metadata"] = metadata
        }

        if alreadyReported || (payloadDict["callKitOnly"] as? Bool) == true {
            // ${CALLKIT_ONLY_MARKER}
            notificationData["callKitOnly"] = true
        }

        emitEvent("incomingCall", data: notificationData)`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] tag bridge-reported incoming as CallKit-only for JS')
}

const PREPARE_UNLOCKED_CALLKIT_ONLY = 'callKitOnly on prepare unlocked incoming'
if (
  pluginSwift &&
  pluginSwift.includes(PREPARE_UNLOCKED_MARKER) &&
  !pluginSwift.includes(PREPARE_UNLOCKED_CALLKIT_ONLY)
) {
  pluginSwift = pluginSwift.replace(
    `        emitEvent("incomingCall", data: data)
    }

    @objc private func handleBridgedCallKitEnd(_ notification: Notification) {`,
    `        data["callKitOnly"] = true
        // ${PREPARE_UNLOCKED_CALLKIT_ONLY}
        emitEvent("incomingCall", data: data)
    }

    @objc private func handleBridgedCallKitEnd(_ notification: Notification) {`,
  )
  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] prepare-unlocked incoming is CallKit-only for JS')
}

console.log('[patch-voip-callkit] done')

const STORE_NATIVE_PUSH_CREDS = 'storeNativePushCredentials for native PushKit sync'
if (pluginSwift && !pluginSwift.includes(STORE_NATIVE_PUSH_CREDS)) {
  if (!pluginSwift.includes('CAPPluginMethod(name: "storeNativePushCredentials"')) {
    pluginSwift = pluginSwift.replace(
      'CAPPluginMethod(name: "updateCallStatus", returnType: CAPPluginReturnPromise),',
      `CAPPluginMethod(name: "storeNativePushCredentials", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "updateCallStatus", returnType: CAPPluginReturnPromise),`,
    )
  }

  if (!pluginSwift.includes('@objc func storeNativePushCredentials')) {
    pluginSwift = pluginSwift.replace(
      '    @objc func updateCallStatus(_ call: CAPPluginCall) {',
      `    @objc func storeNativePushCredentials(_ call: CAPPluginCall) {
        guard let userId = call.getString("userId"),
              let registerKey = call.getString("registerKey"),
              !userId.isEmpty, !registerKey.isEmpty else {
            call.reject("Missing userId or registerKey")
            return
        }
        // ${STORE_NATIVE_PUSH_CREDS}
        NotificationCenter.default.post(
            name: NSNotification.Name("AiMediaTankStoreNativePushCredentials"),
            object: nil,
            userInfo: ["userId": userId, "registerKey": registerKey]
        )
        call.resolve()
    }

    @objc func updateCallStatus(_ call: CAPPluginCall) {`,
    )
  }

  const pluginM = path.join(pluginDir, 'Plugin.m')
  if (fs.existsSync(pluginM) && !fs.readFileSync(pluginM, 'utf8').includes('storeNativePushCredentials')) {
    let pluginMContent = fs.readFileSync(pluginM, 'utf8')
    pluginMContent = pluginMContent.replace(
      'CAP_PLUGIN_METHOD(updateCallStatus, CAPPluginReturnPromise);',
      `CAP_PLUGIN_METHOD(storeNativePushCredentials, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(updateCallStatus, CAPPluginReturnPromise);`,
    )
    fs.writeFileSync(pluginM, pluginMContent)
    console.log('[patch-voip-callkit] register storeNativePushCredentials in Plugin.m')
  }

  fs.writeFileSync(pluginSwiftPath, pluginSwift)
  console.log('[patch-voip-callkit] add storeNativePushCredentials for native PushKit token sync')
}
