import Capacitor
import Foundation
import StoreKit
import UIKit

/**
 * StoreKit 2 bridge for Apple In-App Purchase (memberships + media unlock tiers).
 *
 * Purchase UI must run on the main actor; otherwise the sheet never appears and JS stays
 * stuck on "Processing…". Transaction.updates finishes orphans so later buys are not blocked.
 */
@objc(AppleIAPPlugin)
public class AppleIAPPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleIAPPlugin"
    public let jsName = "AppleIAP"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
    ]

    private var updatesTask: Task<Void, Never>?

    override public func load() {
        super.load()
        updatesTask = Task {
            for await result in Transaction.updates {
                do {
                    let transaction = try Self.checkVerified(result)
                    await transaction.finish()
                    print("[AppleIAP] finished Transaction.updates \(transaction.id)")
                } catch {
                    print("[AppleIAP] Transaction.updates unverified: \(error.localizedDescription)")
                }
            }
        }
    }

    deinit {
        updatesTask?.cancel()
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self), !ids.isEmpty else {
            call.reject("productIds required")
            return
        }
        Task { @MainActor in
            do {
                let products = try await Self.loadProducts(ids: Set(ids))
                let payload: [[String: Any]] = products.map { p in
                    [
                        "id": p.id,
                        "displayName": p.displayName,
                        "description": p.description,
                        "displayPrice": p.displayPrice,
                        "price": NSDecimalNumber(decimal: p.price).doubleValue,
                    ]
                }
                call.resolve(["products": payload])
            } catch {
                call.reject("Failed to load products: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId"), !productId.isEmpty else {
            call.reject("productId required")
            return
        }
        let appAccountToken = call.getString("appAccountToken")
        // StoreKit sheet can take a long time while the user decides.
        call.keepAlive = true

        Task { @MainActor in
            defer { call.keepAlive = false }
            do {
                let products = try await Self.loadProducts(ids: [productId])
                guard let product = products.first else {
                    call.reject(
                        "Product not found: \(productId). Confirm the IAP exists in App Store Connect and this Apple ID can buy in Sandbox/TestFlight.",
                        "PRODUCT_NOT_FOUND"
                    )
                    return
                }

                var options: Set<Product.PurchaseOption> = []
                if let token = appAccountToken, let uuid = UUID(uuidString: token) {
                    options.insert(.appAccountToken(uuid))
                }

                // Without the foreground window, StoreKit never presents the sheet and this
                // call does not return, so the Buy button stays on Processing.
                let result = try await Self.purchase(product, options: options)
                switch result {
                case .success(let verification):
                    let transaction = try Self.checkVerified(verification)
                    let jws = verification.jwsRepresentation
                    await transaction.finish()
                    call.resolve([
                        "signedTransaction": jws,
                        "transactionId": String(transaction.id),
                        "productId": transaction.productID,
                    ])
                case .userCancelled:
                    call.reject("Purchase cancelled", "USER_CANCELLED")
                case .pending:
                    call.reject("Purchase pending (Ask to Buy or parental approval)", "PENDING")
                @unknown default:
                    call.reject("Unknown purchase result")
                }
            } catch {
                call.reject("Purchase failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func restore(_ call: CAPPluginCall) {
        call.keepAlive = true
        Task { @MainActor in
            defer { call.keepAlive = false }
            do {
                try await AppStore.sync()
                var items: [[String: Any]] = []
                for await result in Transaction.currentEntitlements {
                    do {
                        let transaction = try Self.checkVerified(result)
                        items.append([
                            "signedTransaction": result.jwsRepresentation,
                            "transactionId": String(transaction.id),
                            "productId": transaction.productID,
                        ])
                    } catch {
                        continue
                    }
                }
                call.resolve(["transactions": items])
            } catch {
                call.reject("Restore failed: \(error.localizedDescription)")
            }
        }
    }

    @MainActor
    private static func loadProducts(ids: Set<String>) async throws -> [Product] {
        try await withThrowingTaskGroup(of: [Product].self) { group in
            group.addTask {
                try await Product.products(for: ids)
            }
            group.addTask {
                try await Task.sleep(nanoseconds: 25_000_000_000) // 25s
                throw NSError(
                    domain: "AppleIAP",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "Timed out loading products from the App Store"]
                )
            }
            let products = try await group.next()!
            group.cancelAll()
            return products
        }
    }

    @MainActor
    private static func purchase(
        _ product: Product,
        options: Set<Product.PurchaseOption>
    ) async throws -> Product.PurchaseResult {
        if #available(iOS 18.0, *), let scene = foregroundScene() {
            return try await product.purchase(confirmIn: scene, options: options)
        }
        return try await product.purchase(options: options)
    }

    @MainActor
    private static func foregroundScene() -> UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    }

    private static func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let safe):
            return safe
        }
    }
}
