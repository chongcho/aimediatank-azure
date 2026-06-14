import UIKit
import Capacitor

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // VoIP PushKit must register at launch so cancel pushes dismiss CallKit on lock screen.
        AiMediaTankVoipPushBridge.shared.ensureStarted()
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Release VoIP audio when interrupted (e.g. incoming cellular call) so Phone audio keeps working.
        AiMediaTankVoipPushBridge.shared.releaseAudioIfNoConnectedCall()
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        AiMediaTankVoipPushBridge.shared.refreshPushKitRegistration()
        // Unlock → prepare incoming (step 1→2) then connect after Accept (step 3).
        AiMediaTankVoipPushBridge.shared.reconcileForegroundIncomingUi()
        AiMediaTankVoipPushBridge.shared.prepareUnlockedRingingCallsIfNeeded()
        AiMediaTankVoipPushBridge.shared.syncLockScreenCallUiIfNeeded()
        AiMediaTankVoipPushBridge.shared.retryWebRtcConnectIfNeeded()
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        AiMediaTankVoipPushBridge.shared.refreshPushKitRegistration()
        AiMediaTankVoipPushBridge.shared.reconcileForegroundIncomingUi()
        AiMediaTankVoipPushBridge.shared.prepareUnlockedRingingCallsIfNeeded()
        AiMediaTankVoipPushBridge.shared.syncLockScreenCallUiIfNeeded()
        AiMediaTankVoipPushBridge.shared.retryWebRtcConnectIfNeeded()
        NativeVoiceCallEngine.shared.syncUiIfConnected()
    }

    func applicationWillTerminate(_ application: UIApplication) {
        AiMediaTankVoipPushBridge.shared.recoverFromStaleCallState()
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
