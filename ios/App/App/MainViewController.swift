import Capacitor
import UIKit

/**
 * Registers plugins that live in this app target rather than in an npm package.
 *
 * Capacitor only auto-registers classes listed in `packageClassList` of `capacitor.config.json`,
 * which `npx cap sync` generates from installed plugin packages. App-local plugins are never in
 * that list, so without this they fail at runtime with "plugin is not implemented on ios".
 */
class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(NativeAuthSessionPlugin())
    }
}
