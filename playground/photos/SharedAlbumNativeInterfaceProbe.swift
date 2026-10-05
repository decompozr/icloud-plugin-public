// Research only. Enumerates runtime declarations; never constructs a service,
// invokes a selector, reads account state, opens UI, or performs a photo operation.
// Private symbols are leads, not supported APIs or proof of access.
import Foundation
import ObjectiveC.runtime
import Darwin

let frameworks = ["MediaStream", "PhotoLibraryServices"]
var handles: [UnsafeMutableRawPointer] = []
var loading: [[String: Any]] = []
for name in frameworks {
    let path = "/System/Library/PrivateFrameworks/\(name).framework/\(name)"
    let handle = dlopen(path, RTLD_LAZY | RTLD_LOCAL)
    if let handle { handles.append(handle) }
    loading.append(["framework": name, "loaded": handle != nil])
}

let names = [
    "MSASConnection", "XPCNSClientConnection", "MSASPlatformImplementation", "PLCollectionShareSharedStreamBackend",
    "PLCloudSharedDeleteAlbumsJob", "PLCloudSharedUpdateAlbumMetadataJob",
    "PLPublishCloudSharedAssetsJob"
]
func methods(_ type: AnyClass) -> [[String: String]] {
    var count: UInt32 = 0
    guard let list = class_copyMethodList(type, &count) else { return [] }
    defer { free(list) }
    return (0..<Int(count)).map {
        let method = list[$0]
        return ["selector": NSStringFromSelector(method_getName(method)),
                "encoding": method_getTypeEncoding(method).map { String(cString: $0) } ?? ""]
    }.sorted { $0["selector", default: ""] < $1["selector", default: ""] }
}
let declarations: [[String: Any]] = names.map { name in
    guard let type = NSClassFromString(name) else { return ["class": name, "available": false] }
    var result: [String: Any] = ["class": name, "available": true, "instanceMethods": methods(type)]
    if let meta = object_getClass(type) { result["classMethods"] = methods(meta) }
    return result
}
let report: [String: Any] = [
    "schema": 1, "frameworks": loading, "declarations": declarations,
    "serviceConstructed": false, "selectorsInvoked": false,
    "photoOperationsPerformed": false, "authenticatedAccessVerified": false,
    "productionEligible": false
]
let data = try JSONSerialization.data(withJSONObject: report, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
FileHandle.standardOutput.write(Data([10]))
// Keep framework handles alive until process exit; do not tear down system runtime classes.
withExtendedLifetime(handles) {}
