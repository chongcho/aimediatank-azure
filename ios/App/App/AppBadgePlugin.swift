import Capacitor
import Foundation
import UIKit

@objc(AppBadgePlugin)
public class AppBadgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppBadgePlugin"
    public let jsName = "NativeAppBadge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setBadgeCount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearBadge", returnType: CAPPluginReturnPromise),
    ]

    @objc func setBadgeCount(_ call: CAPPluginCall) {
        let count = max(0, call.getInt("count") ?? 0)
        AiMediaTankAlertPushBridge.setAppIconBadge(count)
        call.resolve()
    }

    @objc func clearBadge(_ call: CAPPluginCall) {
        AiMediaTankAlertPushBridge.clearAppIconBadge()
        call.resolve()
    }
}
