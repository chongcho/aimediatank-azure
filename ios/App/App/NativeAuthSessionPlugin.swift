import AuthenticationServices
import Capacitor
import Foundation
import UIKit

/**
 * Social sign-in bridge using ASWebAuthenticationSession.
 *
 * Google rejects OAuth inside embedded WebViews, so the app runs the flow in the system
 * authentication session instead. It shares Safari's cookies (users usually stay signed in) and
 * returns the callback URL directly, so no deep-link listener is needed on iOS.
 */
@objc(NativeAuthSessionPlugin)
public class NativeAuthSessionPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeAuthSessionPlugin"
    public let jsName = "NativeAuthSession"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
    ]

    /// Held for the lifetime of the sheet; ARC would otherwise cancel it immediately.
    private var session: ASWebAuthenticationSession?
    private var contextProvider: PresentationContextProvider?

    @objc func start(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("A sign-in URL is required")
            return
        }
        let callbackScheme = call.getString("callbackScheme") ?? "aimediatank"

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { [weak self] callbackURL, error in
                self?.session = nil
                self?.contextProvider = nil

                if let error = error {
                    let nsError = error as NSError
                    if nsError.domain == ASWebAuthenticationSessionErrorDomain,
                       nsError.code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        call.reject("Sign-in was cancelled")
                    } else {
                        call.reject(error.localizedDescription)
                    }
                    return
                }

                guard let callbackURL = callbackURL else {
                    call.reject("Sign-in did not return a result")
                    return
                }
                call.resolve(["url": callbackURL.absoluteString])
            }

            let provider = PresentationContextProvider(viewController: self.bridge?.viewController)
            self.contextProvider = provider
            session.presentationContextProvider = provider
            // Keep Safari's cookies so returning users get account selection instead of a login form.
            session.prefersEphemeralWebBrowserSession = false
            self.session = session

            if !session.start() {
                self.session = nil
                self.contextProvider = nil
                call.reject("Could not open the sign-in browser")
            }
        }
    }
}

private class PresentationContextProvider: NSObject, ASWebAuthenticationPresentationContextProviding {
    private weak var viewController: UIViewController?

    init(viewController: UIViewController?) {
        self.viewController = viewController
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = viewController?.view.window {
            return window
        }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let window = scenes.flatMap { $0.windows }.first { $0.isKeyWindow }
        return window ?? ASPresentationAnchor()
    }
}
