import Capacitor
import Foundation

/**
 * Exposes whether CallKit is allowed on this device (disabled for China App Store / CN region).
 */
@objc(CallKitCompliancePlugin)
public class CallKitCompliancePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CallKitCompliancePlugin"
    public let jsName = "CallKitCompliance"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isCallKitEnabled", returnType: CAPPluginReturnPromise),
    ]

    @objc func isCallKitEnabled(_ call: CAPPluginCall) {
        call.resolve(["enabled": AiMediaTankVoipPushBridge.isCallKitAllowed()])
    }
}
