import Capacitor
import Foundation

/**
 * Exposes CallKit / Talk availability for China App Store compliance (Guideline 5).
 * China (storefront CHN or region CN/CHN): CallKit not active; Talk button blocked.
 * All other regions: CallKit + Talk (single call stack).
 */
@objc(CallKitCompliancePlugin)
public class CallKitCompliancePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CallKitCompliancePlugin"
    public let jsName = "CallKitCompliance"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isCallKitEnabled", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isVoiceTalkAllowed", returnType: CAPPluginReturnPromise),
    ]

    @objc func isCallKitEnabled(_ call: CAPPluginCall) {
        let allowed = AiMediaTankVoipPushBridge.isCallKitAllowed()
        call.resolve([
            "enabled": allowed,
            "voiceTalkAllowed": allowed,
        ])
    }

    @objc func isVoiceTalkAllowed(_ call: CAPPluginCall) {
        let allowed = AiMediaTankVoipPushBridge.isVoiceTalkAllowed()
        call.resolve(["allowed": allowed])
    }
}
