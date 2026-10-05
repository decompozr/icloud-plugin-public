// Synthetic file-based macOS Keychain experiment. Never use production credentials.
import Foundation
import Security
import CryptoKit

#if UPDATED
let build = "v2"
#elseif THIRD_VERSION
let build = "v3"
#else
let build = "v1"
#endif

func finish(_ action: String, _ status: OSStatus, _ extra: [String: Any] = [:]) -> Never {
    var result: [String: Any] = ["action": action, "build": build, "status": Int(status)]
    for (key, value) in extra { result[key] = value }
    let bytes = try! JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
    print(String(decoding: bytes, as: UTF8.self))
    exit(status == errSecSuccess ? 0 : 1)
}

let args = CommandLine.arguments
guard (args.count == 3 || args.count == 4), args[2].hasPrefix("local.icloud-plugin.experiment.") else {
    finish("arguments", errSecParam)
}
let action = args[1], service = args[2]
guard ["create", "read", "delete", "status"].contains(action) else {
    finish(action, errSecParam)
}
// Only initial creation permits OS UI. Reads must fail rather than prompt/retry.
let interaction = SecKeychainSetUserInteractionAllowed(action == "create")
guard interaction == errSecSuccess else { finish(action, interaction) }
// Certificate experiments explicitly select a disposable keychain, never the login keychain.
var selectedKeychain: SecKeychain?
if args.count == 4 {
    let opened = SecKeychainOpen(args[3], &selectedKeychain)
    guard opened == errSecSuccess else { finish(action, opened) }
}
if action == "status" {
    var keychain: SecKeychain? = selectedKeychain
    let found = keychain != nil ? errSecSuccess : SecKeychainCopyDefault(&keychain)
    guard found == errSecSuccess, let keychain = keychain else { finish(action, found) }
    var flags: SecKeychainStatus = 0
    let status = SecKeychainGetStatus(keychain, &flags)
    finish(action, status, ["unlocked": flags & kSecUnlockStateStatus != 0])
}
var identity: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: service,
    kSecAttrAccount as String: "synthetic-master-key"
]
if let keychain = selectedKeychain {
    identity[kSecMatchSearchList as String] = [keychain]
}
switch action {
case "create":
    var bytes = [UInt8](repeating: 0, count: 32)
    let randomStatus = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
    guard randomStatus == errSecSuccess else { finish(action, randomStatus) }
    var query = identity
    query.removeValue(forKey: kSecMatchSearchList as String)
    if let keychain = selectedKeychain { query[kSecUseKeychain as String] = keychain }
    query[kSecValueData as String] = Data(bytes)
    query[kSecAttrLabel as String] = "Disposable iCloud Plugin Keychain experiment"
    let status = SecItemAdd(query as CFDictionary, nil)
    _ = bytes.withUnsafeMutableBytes { $0.initializeMemory(as: UInt8.self, repeating: 0) }
    finish(action, status)
case "read":
    var query = identity
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess else { finish(action, status) }
    guard var bytes = result as? Data else { finish(action, errSecDecode) }
    let digest = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    let count = bytes.count
    bytes.resetBytes(in: 0..<count)
    finish(action, status, ["byteCount": count, "digest": digest])
case "delete":
    finish(action, SecItemDelete(identity as CFDictionary))
default:
    finish(action, errSecParam)
}
