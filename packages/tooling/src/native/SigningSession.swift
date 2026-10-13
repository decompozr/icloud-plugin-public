import Foundation
import Security
import CryptoKit
import Darwin

struct Request: Decodable {
    let keychainPath: String
    let p12Path: String
    let p12Password: String
    let keychainPassword: String
}
struct SessionFailure: Error { let stage: String; let status: OSStatus }
func checked(_ status: OSStatus, _ stage: String) throws {
    if status != errSecSuccess { throw SessionFailure(stage: stage, status: status) }
}
func emit(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) {
        print(String(decoding: data, as: UTF8.self)); fflush(stdout)
    }
}
func line() throws -> Data {
    var data = Data()
    while data.count <= 65536 {
        var byte: UInt8 = 0
        let count = Darwin.read(STDIN_FILENO, &byte, 1)
        if count == 0 { return data }
        if count < 0 { throw SessionFailure(stage: "input", status: -1) }
        if byte == 10 { return data }
        data.append(byte)
    }
    throw SessionFailure(stage: "input_limit", status: -1)
}
@main struct SigningSession {
    static func main() {
        signal(SIGPIPE, SIG_IGN)
        exit(run())
    }
    static func run() -> Int32 {
        var created: SecKeychain?
        defer { if let keychain = created { _ = SecKeychainDelete(keychain) } }
        do {
            try checked(SecKeychainSetUserInteractionAllowed(false), "disable_process_prompts")
            let request = try JSONDecoder().decode(Request.self, from: line())
            let parent = URL(fileURLWithPath: request.keychainPath).deletingLastPathComponent().path
            let attributes = try FileManager.default.attributesOfItem(atPath: parent)
            guard request.keychainPath.hasSuffix("/signing.keychain-db"),
                  attributes[.ownerAccountID] as? UInt32 == getuid(),
                  (attributes[.posixPermissions] as? NSNumber)?.intValue == 0o700,
                  !FileManager.default.fileExists(atPath: request.keychainPath),
                  request.keychainPassword.count >= 32,
                  request.p12Password.utf8.count <= 4096 else { throw SessionFailure(stage: "invalid_session", status: -1) }
            let password = Array(request.keychainPassword.utf8)
            try password.withUnsafeBytes { bytes in
                try checked(SecKeychainCreate(request.keychainPath, UInt32(bytes.count), bytes.baseAddress, false, nil, &created), "create")
            }
            guard let keychain = created else { throw SessionFailure(stage: "create", status: -1) }
            var settings = SecKeychainSettings(version: UInt32(SEC_KEYCHAIN_SETTINGS_VERS1), lockOnSleep: false, useLockInterval: true, lockInterval: 900)
            try checked(SecKeychainSetSettings(keychain, &settings), "settings")
            var trusted: SecTrustedApplication?
            try checked(SecTrustedApplicationCreateFromPath("/usr/bin/codesign", &trusted), "trusted_tool")
            var access: SecAccess?
            try checked(SecAccessCreate("DecompozR build signing" as CFString, [trusted!] as CFArray, &access), "access")
            let data = try Data(contentsOf: URL(fileURLWithPath: request.p12Path))
            guard data.count <= 1024 * 1024 else { throw SessionFailure(stage: "credential_limit", status: -1) }
            var items: CFArray?
            let options = [kSecImportExportPassphrase as String: request.p12Password,
                           kSecImportExportKeychain as String: keychain,
                           kSecImportExportAccess as String: access!] as [String: Any]
            try checked(SecPKCS12Import(data as CFData, options as CFDictionary, &items), "import")
            guard let identities = items as? [[String: Any]], identities.count == 1,
                  let value = identities[0][kSecImportItemIdentity as String] else { throw SessionFailure(stage: "identity_count", status: -1) }
            let identity = value as! SecIdentity
            var certificate: SecCertificate?
            try checked(SecIdentityCopyCertificate(identity, &certificate), "certificate")
            guard let certificate = certificate else { throw SessionFailure(stage: "certificate", status: -1) }
            let fingerprint = Insecure.SHA1.hash(data: SecCertificateCopyData(certificate) as Data).map { String(format: "%02X", $0) }.joined()
            emit(["ready": true, "identity": fingerprint])
            // Keep the private session alive only while the owner pipe is open.
            _ = try line()
            try checked(SecKeychainDelete(keychain), "delete")
            created = nil
            emit(["closed": true])
            return 0
        } catch {
            let failure = error as? SessionFailure
            emit(["ready": false, "error": failure?.stage ?? "session_failed", "status": failure?.status ?? -1])
            return 1
        }
    }
}
