// Disposable signing keychain lifecycle; no login/system trust or default-keychain changes.
import Foundation
import Security

func finish(_ action: String, _ status: OSStatus) -> Never {
    print("{\"action\":\"\(action)\",\"status\":\(status)}")
    exit(status == errSecSuccess ? 0 : 1)
}
let args = CommandLine.arguments
guard args.count == 3, ["create", "delete"].contains(args[1]) else { finish("arguments", errSecParam) }
let action = args[1], path = args[2]
guard URL(fileURLWithPath: path).lastPathComponent == "signing.keychain",
      URL(fileURLWithPath: path).deletingLastPathComponent().lastPathComponent.hasPrefix("icloud-keychain-signed.")
else { finish(action, errSecParam) }
_ = SecKeychainSetUserInteractionAllowed(false)
var keychain: SecKeychain?
if action == "delete" {
    let opened = SecKeychainOpen(path, &keychain)
    guard opened == errSecSuccess, let keychain = keychain else { finish(action, opened) }
    finish(action, SecKeychainDelete(keychain))
}
// Password comes only through a private pipe and is only for this disposable keychain.
var password = FileHandle.standardInput.readDataToEndOfFile()
let created = password.withUnsafeBytes {
    SecKeychainCreate(path, UInt32(password.count), $0.baseAddress, false, nil, &keychain)
}
password.resetBytes(in: 0..<password.count)
guard created == errSecSuccess, let keychain = keychain else { finish(action, created) }
// Some file-based implementations add new keychains to the user's search list.
// Remove only this experiment's entry, preserving any concurrent unrelated changes.
var search: CFArray?
let copied = SecKeychainCopySearchList(&search)
guard copied == errSecSuccess, let entries = search as? [SecKeychain] else { finish(action, copied) }
let retained = entries.filter { !CFEqual($0, keychain) }
if retained.count != entries.count {
    let restored = SecKeychainSetSearchList(retained as CFArray)
    guard restored == errSecSuccess else { finish(action, restored) }
}
finish(action, errSecSuccess)
