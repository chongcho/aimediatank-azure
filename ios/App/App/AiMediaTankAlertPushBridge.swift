import Foundation
import UIKit
import UserNotifications

/// Standard APNs alert pushes for private chat (banner + sound). Separate from PushKit VoIP.
final class AiMediaTankAlertPushBridge: NSObject, UNUserNotificationCenterDelegate {
    static let shared = AiMediaTankAlertPushBridge()

    private static let alertTokenHexKey = "AiMediaTank.alertPushTokenHex"
    private static let alertTokenServerSyncedHexKey = "AiMediaTank.alertPushTokenServerSyncedHex"
    private static let nativePushUserIdKey = "AiMediaTank.nativePushUserId"
    private static let nativePushRegisterKeyKey = "AiMediaTank.nativePushRegisterKey"

    private var authorizationRequested = false

    func ensureStarted() {
        UNUserNotificationCenter.current().delegate = self
        requestAuthorizationAndRegisterIfNeeded()
    }

    func didRegisterDeviceToken(_ deviceToken: Data) {
        let hex = deviceToken.map { String(format: "%02x", $0) }.joined()
        guard !hex.isEmpty else { return }
        UserDefaults.standard.set(hex, forKey: Self.alertTokenHexKey)
        print("[AiMediaTankAlertPush] APNs device token received prefix=\(hex.prefix(8))")
        syncAlertTokenToServer(tokenHex: hex)
    }

    func didFailToRegister(error: Error) {
        print("[AiMediaTankAlertPush] APNs register failed: \(error.localizedDescription)")
    }

    func syncAlertTokenOnForeground() {
        UserDefaults.standard.removeObject(forKey: Self.alertTokenServerSyncedHexKey)
        if let hex = UserDefaults.standard.string(forKey: Self.alertTokenHexKey), !hex.isEmpty {
            syncAlertTokenToServer(tokenHex: hex)
        } else {
            requestAuthorizationAndRegisterIfNeeded(force: true)
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .sound, .list, .badge])
        } else {
            completionHandler([.alert, .sound, .badge])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        defer { completionHandler() }
        let userInfo = response.notification.request.content.userInfo
        let urlString =
            (userInfo["url"] as? String)
            ?? (userInfo["aps"] as? [String: Any]).flatMap { $0["url"] as? String }
        guard let urlString, !urlString.isEmpty, let url = URL(string: urlString) else { return }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
    }

    private func requestAuthorizationAndRegisterIfNeeded(force: Bool = false) {
        if authorizationRequested && !force { return }
        authorizationRequested = true
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error {
                print("[AiMediaTankAlertPush] authorization error: \(error.localizedDescription)")
            }
            guard granted else {
                print("[AiMediaTankAlertPush] notification authorization denied")
                return
            }
            DispatchQueue.main.async {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    private func syncAlertTokenToServer(tokenHex: String) {
        let normalized = tokenHex.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !normalized.isEmpty else { return }
        if normalized == UserDefaults.standard.string(forKey: Self.alertTokenServerSyncedHexKey) {
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
                "platform": "ios_alert",
            ])
            URLSession.shared.dataTask(with: request) { _, response, error in
                let code = (response as? HTTPURLResponse)?.statusCode ?? 0
                if code == 200 {
                    UserDefaults.standard.set(normalized, forKey: Self.alertTokenServerSyncedHexKey)
                    print("[AiMediaTankAlertPush] alert token synced for \(userId)")
                } else {
                    print(
                        "[AiMediaTankAlertPush] alert token sync HTTP \(code) err=\(error?.localizedDescription ?? "none")"
                    )
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
            "platform": "ios_alert",
        ])
        if let cookies = HTTPCookieStorage.shared.cookies(for: url) {
            for (key, value) in HTTPCookie.requestHeaderFields(with: cookies) {
                request.setValue(value, forHTTPHeaderField: key)
            }
        }
        URLSession.shared.dataTask(with: request) { _, response, error in
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if code == 200 {
                UserDefaults.standard.set(normalized, forKey: Self.alertTokenServerSyncedHexKey)
            }
            print("[AiMediaTankAlertPush] cookie alert token sync HTTP \(code) err=\(error?.localizedDescription ?? "none")")
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
}
