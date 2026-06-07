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

const RINGTONE_MARKER = 'configuration.ringtoneSound = "incoming-ring.wav"'
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
        let incomingIds = activeCalls.filter { !$0.value.isOutgoing }.map(\.key)
        for uuid in incomingIds {
            cancelIncomingCall(uuid: uuid)
        }
    }`,
  )
  fs.writeFileSync(callManagerPath, callManager)
  console.log('[patch-voip-callkit] added cancelAllIncomingCalls')
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

console.log('[patch-voip-callkit] done')
