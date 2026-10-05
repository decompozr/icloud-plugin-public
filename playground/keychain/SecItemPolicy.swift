import Foundation
import Security
import LocalAuthentication

// Query-construction fixture only: never calls SecItemAdd/CopyMatching/Delete.
enum Invalid: Error { case request }
func policy(_ request: [String: Any]) throws -> [String: Any] {
    guard let installation = request["installationId"] as? String,
          UUID(uuidString: installation) != nil,
          let kind = request["kind"] as? String, ["master", "password"].contains(kind),
          let action = request["action"] as? String, ["read", "add", "delete"].contains(action),
          let interaction = request["interaction"] as? String,
          action == "add" ? ["setup", "prohibited"].contains(interaction) : interaction == "prohibited" else { throw Invalid.request }
    var identity: [Any] = [kind == "password" ? "account" : "master", installation]
    if kind == "password" {
        guard let owner = request["ownerId"] as? String, !owner.isEmpty,
              let account = request["accountId"] as? String, UUID(uuidString: account) != nil,
              let revision = request["revision"] as? Int, revision > 0,
              let generation = request["generation"] as? Int, generation > 0 else { throw Invalid.request }
        identity += [owner, account, revision, generation]
    }
    let selector = String(data: try JSONSerialization.data(withJSONObject: identity, options: [.withoutEscapingSlashes]), encoding: .utf8)!
    let context = LAContext()
    context.interactionNotAllowed = interaction == "prohibited"
    var query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "org.decompozr.icloud-plugin.custody.v1",
        kSecAttrAccount as String: selector,
        kSecUseDataProtectionKeychain as String: true,
        kSecAttrSynchronizable as String: false,
        kSecAttrAccessGroup as String: "EXPERIMENT.unprovisioned.helper",
        kSecUseAuthenticationContext as String: context,
    ]
    if action == "read" { query[kSecReturnData as String] = true; query[kSecMatchLimit as String] = kSecMatchLimitOne }
    if action == "add" { query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly; query[kSecValueData as String] = Data(repeating: 0, count: 32) }
    return query
}
do {
    let requests = try JSONSerialization.jsonObject(with: FileHandle.standardInput.readDataToEndOfFile()) as! [[String: Any]]
    var results: [[String: Any]] = []
    for request in requests {
        let query = try policy(request), context = query[kSecUseAuthenticationContext as String] as! LAContext
        results.append(["account": query[kSecAttrAccount as String]!, "dataProtection": query[kSecUseDataProtectionKeychain as String]!, "synchronizable": query[kSecAttrSynchronizable as String]!, "interactionNotAllowed": context.interactionNotAllowed])
    }
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: results))
} catch { FileHandle.standardOutput.write(Data("{\"error\":\"invalid_input\"}".utf8)); exit(2) }
