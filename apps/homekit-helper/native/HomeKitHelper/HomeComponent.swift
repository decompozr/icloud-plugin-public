import Foundation
import HomeKit
import UIKit
import Darwin
import CryptoKit
import CoreFoundation

class HomeComponent: NSObject {
    unowned let runtime: HomeKitRuntime
    init(runtime: HomeKitRuntime) { self.runtime = runtime; super.init() }
    var homes: [HMHome] { runtime.homes }
    var readOnly: Bool { runtime.launch.isReadOnly }
    var productionControls: Bool { runtime.launch.mode == .control }
    var lifecycleRequested: Bool { runtime.launch.mode == .definitions || productionControls }
    func scalar(_ value: Any?) -> Any { HomeValue.scalar(value) }
    func emit(_ object: [String: Any]) { runtime.transport.emit(object) }
    func reply(id: Any, payload: [String: Any], failed: Bool) { runtime.transport.reply(id: id, payload: payload, failed: failed) }
}
enum HomeValue {
    static func scalar(_ value: Any?) -> Any {
        guard let value = value else { return NSNull() }
        if let data = value as? Data { return ["base64": data.base64EncodedString()] }
        if let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
           String(cString: number.objCType) == "Q", number.uint64Value > 9007199254740991 {
            return ["decimal": number.stringValue]
        }
        if JSONSerialization.isValidJSONObject([value]) { return value }
        return ["unsupportedValueType": String(describing: type(of: value))]
    }

}
