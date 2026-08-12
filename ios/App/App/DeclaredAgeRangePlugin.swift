import Capacitor
import Foundation
import UIKit

#if canImport(DeclaredAgeRange)
import DeclaredAgeRange
#endif

/**
 * Apple Declared Age Range API bridge (iOS 26+).
 * Used before enabling social media / UGC features so under-13 users stay locked out
 * (App Store “Social Media Disabled for Users Under 13”).
 */
@objc(DeclaredAgeRangePlugin)
public class DeclaredAgeRangePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DeclaredAgeRangePlugin"
    public let jsName = "DeclaredAgeRange"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestAgeRange", returnType: CAPPluginReturnPromise),
    ]

    @objc func requestAgeRange(_ call: CAPPluginCall) {
        #if canImport(DeclaredAgeRange)
        if #available(iOS 26.0, *) {
            Task { @MainActor in
                await self.performRequest(call)
            }
            return
        }
        #endif
        call.resolve([
            "available": false,
            "eligibleForAgeFeatures": false,
            "status": "unavailable",
            "lowerBound": NSNull(),
            "upperBound": NSNull(),
            "meetsSocialMinAge": true,
            "message": "Declared Age Range requires iOS 26+",
        ])
    }

    #if canImport(DeclaredAgeRange)
    @available(iOS 26.0, *)
    @MainActor
    private func performRequest(_ call: CAPPluginCall) async {
        let gates = (call.getArray("ageGates", Int.self) ?? [13, 16, 18]).filter { $0 > 0 }.prefix(3)
        let ageGates = Array(gates.isEmpty ? [13, 16, 18] : gates)

        guard let host = self.bridge?.viewController else {
            call.resolve([
                "available": true,
                "eligibleForAgeFeatures": false,
                "status": "error",
                "lowerBound": NSNull(),
                "upperBound": NSNull(),
                "meetsSocialMinAge": false,
                "message": "No view controller to present age range request",
            ])
            return
        }

        do {
            let eligible = try await AgeRangeService.shared.isEligibleForAgeFeatures
            if !eligible {
                call.resolve([
                    "available": true,
                    "eligibleForAgeFeatures": false,
                    "status": "unavailable",
                    "lowerBound": NSNull(),
                    "upperBound": NSNull(),
                    "meetsSocialMinAge": true,
                    "message": "Age assurance not required in this region; use account birthday",
                ])
                return
            }

        let g0 = ageGates.count > 0 ? ageGates[0] : 13
            let g1 = ageGates.count > 1 ? ageGates[1] : 16
            let g2 = ageGates.count > 2 ? ageGates[2] : 18
            let response: AgeRangeService.Response
            if ageGates.count >= 3 {
                response = try await AgeRangeService.shared.requestAgeRange(
                    ageGates: g0, g1, g2,
                    in: host
                )
            } else if ageGates.count >= 2 {
                response = try await AgeRangeService.shared.requestAgeRange(
                    ageGates: g0, g1,
                    in: host
                )
            } else {
                response = try await AgeRangeService.shared.requestAgeRange(
                    ageGates: g0,
                    in: host
                )
            }

            switch response {
            case let .sharing(ageRange):
                let lower = ageRange.lowerBound
                let upper = ageRange.upperBound
                // Under-13 social disabled: require declared lower bound ≥ 13.
                let meets = (lower ?? 0) >= 13
                call.resolve([
                    "available": true,
                    "eligibleForAgeFeatures": true,
                    "status": "sharing",
                    "lowerBound": lower as Any,
                    "upperBound": upper as Any,
                    "meetsSocialMinAge": meets,
                ])
            case .declinedSharing:
                call.resolve([
                    "available": true,
                    "eligibleForAgeFeatures": true,
                    "status": "declinedSharing",
                    "lowerBound": NSNull(),
                    "upperBound": NSNull(),
                    "meetsSocialMinAge": false,
                    "message": "Age range sharing declined",
                ])
            @unknown default:
                call.resolve([
                    "available": true,
                    "eligibleForAgeFeatures": true,
                    "status": "error",
                    "lowerBound": NSNull(),
                    "upperBound": NSNull(),
                    "meetsSocialMinAge": false,
                    "message": "Unknown Declared Age Range response",
                ])
            }
        } catch {
            call.resolve([
                "available": true,
                "eligibleForAgeFeatures": true,
                "status": "error",
                "lowerBound": NSNull(),
                "upperBound": NSNull(),
                "meetsSocialMinAge": false,
                "message": error.localizedDescription,
            ])
        }
    }
    #endif
}
