import Capacitor
import Foundation
import StoreKit
import UIKit

/**
 * StoreKit bridge for Apple In-App Purchase (memberships + media unlock tiers).
 *
 * Adding a payment by product id alone never presents the Sandbox sign-in.
 * Ask the App Store for the SKProduct first, then add SKPayment(product:).
 * StoreKit 2 still supplies the signed transaction for server verification.
 */
@objc(AppleIAPPlugin)
public class AppleIAPPlugin: CAPPlugin, CAPBridgedPlugin, SKPaymentTransactionObserver, SKProductsRequestDelegate {
    public let identifier = "AppleIAPPlugin"
    public let jsName = "AppleIAP"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
    ]

    private final class Inflight {
        let call: CAPPluginCall
        let productId: String
        let startedAt: Date
        let appAccountToken: String?
        var settled = false
        var enqueued = false
        init(call: CAPPluginCall, productId: String, appAccountToken: String?) {
            self.call = call
            self.productId = productId
            self.appAccountToken = appAccountToken
            self.startedAt = Date()
        }
    }

    private var updatesTask: Task<Void, Never>?
    private var observerAdded = false
    private var inflight: Inflight?
    private var productsRequest: SKProductsRequest?

    override public func load() {
        super.load()
        ensureObserver()
        finishIdlePayments()
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { continue }
                do {
                    let transaction = try Self.checkVerified(result)
                    let jws = result.jwsRepresentation
                    await self.deliver(
                        productId: transaction.productID,
                        jws: jws,
                        transactionId: String(transaction.id),
                        purchaseDate: transaction.purchaseDate
                    )
                    await transaction.finish()
                } catch {
                    print("[AppleIAP] Transaction.updates unverified: \(error.localizedDescription)")
                }
            }
        }
    }

    deinit {
        updatesTask?.cancel()
        if observerAdded {
            SKPaymentQueue.default().remove(self)
        }
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self), !ids.isEmpty else {
            call.reject("productIds required")
            return
        }
        Task {
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
        call.keepAlive = true
        let appAccountToken = call.getString("appAccountToken")

        DispatchQueue.main.async { [weak self] in
            guard let self else {
                call.keepAlive = false
                call.reject("Purchase UI is unavailable")
                return
            }
            Task { @MainActor in
                if self.inflight != nil {
                    call.keepAlive = false
                    call.reject("A purchase is already in progress", "IN_PROGRESS")
                    return
                }
                let pending = Inflight(call: call, productId: productId, appAccountToken: appAccountToken)
                self.inflight = pending
                self.requestProduct(pending)
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

    public func paymentQueue(_ queue: SKPaymentQueue, updatedTransactions transactions: [SKPaymentTransaction]) {
        for transaction in transactions {
            let productId = transaction.payment.productIdentifier
            switch transaction.transactionState {
            case .purchasing:
                break
            case .purchased, .restored:
                queue.finishTransaction(transaction)
                Task {
                    await self.collectJws(productId: productId)
                }
            case .failed:
                queue.finishTransaction(transaction)
                let cancelled = (transaction.error as? SKError)?.code == .paymentCancelled
                let message = cancelled
                    ? "Purchase cancelled"
                    : (transaction.error?.localizedDescription ?? "Purchase failed")
                Task { @MainActor in
                    guard self.inflight?.productId == productId else { return }
                    self.failPurchase(message: message, code: cancelled ? "USER_CANCELLED" : "FAILED")
                }
            case .deferred:
                Task { @MainActor in
                    guard self.inflight?.productId == productId else { return }
                    self.failPurchase(
                        message: "Purchase pending (Ask to Buy or parental approval)",
                        code: "PENDING"
                    )
                }
            @unknown default:
                break
            }
        }
    }

    @MainActor
    private func requestProduct(_ pending: Inflight) {
        guard SKPaymentQueue.canMakePayments() else {
            failPurchase(message: "In-App Purchases are turned off in Settings.", code: "PAYMENTS_DISABLED")
            return
        }
        ensureObserver()
        finishIdlePayments()
        let request = SKProductsRequest(productIdentifiers: [pending.productId])
        request.delegate = self
        productsRequest = request
        request.start()
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 20_000_000_000)
            guard let inflight = self.inflight, inflight === pending, !inflight.enqueued, !inflight.settled else { return }
            self.productsRequest?.cancel()
            self.productsRequest = nil
            self.failPurchase(
                message: "App Store did not return \(pending.productId). In App Store Connect, set it Cleared for Sale and Ready to Submit.",
                code: "PRODUCT_TIMEOUT"
            )
        }
    }

    public func productsRequest(_ request: SKProductsRequest, didReceive response: SKProductsResponse) {
        let products = response.products
        let invalid = response.invalidProductIdentifiers
        Task { @MainActor in
            guard let pending = self.inflight, !pending.settled, !pending.enqueued else { return }
            guard let product = products.first(where: { $0.productIdentifier == pending.productId }) else {
                let listed = invalid.isEmpty ? pending.productId : invalid.joined(separator: ", ")
                self.failPurchase(
                    message: "App Store does not sell \(listed). In App Store Connect, set that product Cleared for Sale and Ready to Submit.",
                    code: "PRODUCT_NOT_FOUND"
                )
                return
            }
            self.enqueue(pending, product: product)
        }
    }

    public func request(_ request: SKRequest, didFailWithError error: Error) {
        Task { @MainActor in
            self.failPurchase(
                message: "App Store product request failed: \(error.localizedDescription)",
                code: "PRODUCT_REQUEST_FAILED"
            )
        }
    }

    @MainActor
    private func enqueue(_ pending: Inflight, product: SKProduct) {
        guard !pending.enqueued, !pending.settled else { return }
        ensureObserver()
        pending.enqueued = true
        let payment = SKMutablePayment(product: product)
        payment.quantity = 1
        if let token = pending.appAccountToken, let uuid = UUID(uuidString: token) {
            payment.applicationUsername = uuid.uuidString
        }
        SKPaymentQueue.default().add(payment)
    }

    private func ensureObserver() {
        if observerAdded { return }
        SKPaymentQueue.default().add(self)
        observerAdded = true
    }

    private func finishIdlePayments() {
        let queue = SKPaymentQueue.default()
        for transaction in queue.transactions {
            if transaction.transactionState != .purchasing {
                queue.finishTransaction(transaction)
            }
        }
    }

    private func collectJws(productId: String) async {
        for _ in 0..<20 {
            let waiting = await MainActor.run { self.inflight?.productId == productId && self.inflight?.settled == false }
            if !waiting { return }
            if let result = await Transaction.latest(for: productId) {
                do {
                    let transaction = try Self.checkVerified(result)
                    await self.deliver(
                        productId: transaction.productID,
                        jws: result.jwsRepresentation,
                        transactionId: String(transaction.id),
                        purchaseDate: transaction.purchaseDate
                    )
                    await transaction.finish()
                    let done = await MainActor.run { self.inflight == nil }
                    if done { return }
                } catch {
                    print("[AppleIAP] latest transaction unverified: \(error.localizedDescription)")
                }
            }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
        await MainActor.run {
            guard self.inflight?.productId == productId else { return }
            self.failPurchase(
                message: "Apple completed the payment but the receipt was not ready. Tap Buy again.",
                code: "RECEIPT"
            )
        }
    }

    @MainActor
    private func deliver(productId: String, jws: String, transactionId: String, purchaseDate: Date) {
        guard let inflight, inflight.productId == productId, !inflight.settled else { return }
        guard purchaseDate >= inflight.startedAt.addingTimeInterval(-30) else { return }
        inflight.settled = true
        let call = inflight.call
        self.inflight = nil
        call.keepAlive = false
        call.resolve([
            "signedTransaction": jws,
            "transactionId": transactionId,
            "productId": productId,
        ])
    }

    @MainActor
    private func failPurchase(message: String, code: String) {
        guard let inflight, !inflight.settled else { return }
        inflight.settled = true
        let call = inflight.call
        self.inflight = nil
        self.productsRequest = nil
        call.keepAlive = false
        call.reject(message, code)
        presentNotice(message)
    }

    @MainActor
    private func presentNotice(_ message: String) {
        guard let root = bridge?.viewController else { return }
        let alert = UIAlertController(title: "In-App Purchase", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        var top = root
        while let presented = top.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        top.present(alert, animated: true)
    }

    private static func loadProducts(ids: Set<String>) async throws -> [Product] {
        try await withThrowingTaskGroup(of: [Product].self) { group in
            group.addTask {
                try await Product.products(for: ids)
            }
            group.addTask {
                try await Task.sleep(nanoseconds: 25_000_000_000)
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

    private static func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .unverified(_, let error):
            throw error
        case .verified(let safe):
            return safe
        }
    }
}
