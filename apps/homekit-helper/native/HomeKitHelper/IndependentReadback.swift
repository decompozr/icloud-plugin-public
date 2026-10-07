import Foundation
import HomeKit
import UIKit
import Darwin
import CryptoKit
import CoreFoundation

final class LifecycleReadback: NSObject, HMHomeManagerDelegate {
    private(set) var manager: HMHomeManager!
    private var completed = false
    private let completion: ([HMHome]) -> Void
    init(completion: @escaping ([HMHome]) -> Void) {
        self.completion = completion; super.init()
        manager = HMHomeManager(); manager.delegate = self
    }
    func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        guard !completed else { return }; completed = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.completion(manager.homes) }
    }
}

// Independent SDK readback isolates provider acknowledgment from verified definitions.
// Inspired by the lifecycle/transport patterns documented in README.md; original source.
