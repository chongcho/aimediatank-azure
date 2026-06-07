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

console.log('[patch-voip-callkit] done')
