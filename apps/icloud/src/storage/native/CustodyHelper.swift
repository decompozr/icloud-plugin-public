import Foundation
import Security
import LocalAuthentication

// Source only; runtime/release selection requires native signing/profile acceptance.
enum Failure: String, Error {
    case invalid_input, locked, denied, missing, conflict, recovery_required, outcome_unknown
}
enum Action: String, Decodable { case read, add, delete }
enum Kind: String, Decodable { case master, password }
enum Interaction: String, Decodable { case prohibited, setup }
func uuid(_ value: String) -> Bool {
    return value.utf8.count == 36 && value.range(of: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$", options: .regularExpression) != nil
}
struct Header: Decodable {
    let version: Int
    let requestId: String
    let action: Action
    let kind: Kind
    let installationId: String
    let interaction: Interaction
    let ownerId: String?
    let accountId: String?
    let revision: Int?
    let generation: Int?
}
struct Configuration {
    let installationId: String
    let group: String
    #if CUSTODY_FIXTURE
    let fixtureMode: String
    #endif
    init() throws {
        let args = CommandLine.arguments
        #if CUSTODY_FIXTURE
        guard args.count == 7, args[5] == "--fixture-mode" else { throw Failure.invalid_input }
        fixtureMode = args[6]
        #else
        guard args.count == 5 else { throw Failure.invalid_input }
        #endif
        guard args[1] == "--installation-id", uuid(args[2]),
              args[3] == "--access-group", !args[4].isEmpty, args[4].utf8.count <= 256,
              args[4].unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-").contains($0) }) else { throw Failure.invalid_input }
        installationId = args[2]; group = args[4]
    }
}
func exact(_ count: Int) throws -> Data {
    var data = Data()
    while data.count < count {
        guard let part = try FileHandle.standardInput.read(upToCount: count - data.count), !part.isEmpty else { throw Failure.invalid_input }
        data.append(part)
    }
    return data
}
func integer(_ data: Data, _ offset: Int) -> Int {
    return data[offset..<offset+4].reduce(0) { ($0 << 8) | Int($1) }
}
func valid(_ header: Header, _ raw: Data, _ payload: Data, _ configuration: Configuration) throws {
    guard header.version == 1, uuid(header.requestId), uuid(header.installationId) else { throw Failure.invalid_input }
    guard header.installationId == configuration.installationId else { throw Failure.conflict }
    guard let object = try JSONSerialization.jsonObject(with: raw) as? [String: Any] else { throw Failure.invalid_input }
    var keys: Set<String> = ["version", "requestId", "action", "kind", "installationId", "interaction"]
    if header.kind == .password {
        keys.formUnion(["ownerId", "accountId", "revision", "generation"])
        guard let owner = header.ownerId, !owner.isEmpty, owner.utf16.count <= 2048,
              let account = header.accountId, uuid(account),
              let revision = header.revision, revision > 0, revision <= 9007199254740991,
              let generation = header.generation, generation > 0, generation <= 9007199254740991 else { throw Failure.invalid_input }
    }
    guard Set(object.keys) == keys else { throw Failure.invalid_input }
    if header.action == .add {
        guard header.kind == .master ? payload.count == 32 : !payload.isEmpty && String(data: payload, encoding: .utf8) != nil else { throw Failure.invalid_input }
    } else {
        guard payload.isEmpty, header.interaction == .prohibited else { throw Failure.invalid_input }
    }
}
func selector(_ header: Header) throws -> String {
    var identity: [Any] = [header.kind == .master ? "master" : "account", header.installationId]
    if header.kind == .password { identity += [header.ownerId!, header.accountId!, header.revision!, header.generation!] }
    guard let result = String(data: try JSONSerialization.data(withJSONObject: identity, options: [.withoutEscapingSlashes]), encoding: .utf8) else { throw Failure.invalid_input }
    return result
}
func query(_ header: Header, _ configuration: Configuration, _ payload: Data) throws -> [String: Any] {
    let context = LAContext(); context.interactionNotAllowed = header.interaction == .prohibited
    var attributes: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "org.decompozr.icloud-plugin.custody.v1",
        kSecAttrAccount as String: try selector(header),
        kSecAttrAccessGroup as String: configuration.group,
        kSecAttrSynchronizable as String: false,
        kSecUseDataProtectionKeychain as String: true,
        kSecUseAuthenticationContext as String: context,
    ]
    switch header.action {
    case .read: attributes[kSecReturnData as String] = true; attributes[kSecMatchLimit as String] = kSecMatchLimitOne
    case .add: attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly; attributes[kSecValueData as String] = payload
    case .delete: break
    }
    return attributes
}
func mapped(_ status: OSStatus, _ action: Action) -> Failure {
    switch status {
    case errSecItemNotFound: return .missing
    case errSecDuplicateItem: return .conflict
    case errSecAuthFailed, errSecMissingEntitlement: return .denied
    case errSecInteractionNotAllowed: return .locked
    case errSecParam: return .invalid_input
    default: return action == .read ? .recovery_required : .outcome_unknown
    }
}
func native(_ header: Header, _ configuration: Configuration, _ payload: Data) throws -> Data {
    let attributes = try query(header, configuration, payload)
    var value: CFTypeRef?
    let status: OSStatus
    switch header.action {
    case .read: status = SecItemCopyMatching(attributes as CFDictionary, &value)
    case .add: status = SecItemAdd(attributes as CFDictionary, nil)
    case .delete: status = SecItemDelete(attributes as CFDictionary)
    }
    guard status == errSecSuccess else { throw mapped(status, header.action) }
    if header.action == .read {
        guard let bytes = value as? Data else { throw Failure.recovery_required }
        return bytes
    }
    return Data()
}
#if CUSTODY_FIXTURE
func fixture(_ header: Header, _ configuration: Configuration, _ payload: Data) throws -> Data {
    // Compile-time isolated path: the fixture never invokes native().
    switch configuration.fixtureMode {
    case "success":
        if header.action == .read { return header.kind == .master ? Data(repeating: 7, count: 32) : Data("synthetic-password".utf8) }
        if header.action == .add {
            guard header.kind == .master ? payload.allSatisfy({ $0 == 7 }) : payload == Data("synthetic-password".utf8) else { throw Failure.conflict }
        }
        return Data()
    case "missing": throw mapped(errSecItemNotFound, header.action)
    case "duplicate": throw mapped(errSecDuplicateItem, header.action)
    case "locked": throw mapped(errSecInteractionNotAllowed, header.action)
    case "denied": throw mapped(errSecMissingEntitlement, header.action)
    case "internal": throw mapped(errSecInternalComponent, header.action)
    case "wrong-size": return Data(repeating: 7, count: 31)
    default: throw Failure.invalid_input
    }
}
#endif
func reply(_ id: String, _ failure: Failure?, _ payload: Data = Data()) throws {
    var header: [String: Any] = ["version": 1, "requestId": id, "status": failure == nil ? "ok" : "error"]
    if let failure = failure { header["code"] = failure.rawValue }
    let json = try JSONSerialization.data(withJSONObject: header)
    var frame = Data()
    for value in [json.count, payload.count] { for shift in [24, 16, 8, 0] { frame.append(UInt8((value >> shift) & 255)) } }
    frame.append(json); frame.append(payload); try FileHandle.standardOutput.write(contentsOf: frame)
}
var requestId = "00000000-0000-4000-8000-000000000000"
var mutatingAttempted = false
do {
    let configuration = try Configuration(), prefix = try exact(8)
    let headerLength = integer(prefix, 0), payloadLength = integer(prefix, 4)
    guard headerLength > 0, headerLength <= 4096, payloadLength <= 65536 else { throw Failure.invalid_input }
    let raw = try exact(headerLength)
    if let object = try? JSONSerialization.jsonObject(with: raw) as? [String: Any],
       let id = object["requestId"] as? String, uuid(id) { requestId = id }
    let header = try JSONDecoder().decode(Header.self, from: raw)
    var payload = try exact(payloadLength); defer { payload.resetBytes(in: 0..<payload.count) }
    guard (try FileHandle.standardInput.read(upToCount: 1))?.isEmpty != false else { throw Failure.invalid_input }
    try valid(header, raw, payload, configuration)
    mutatingAttempted = header.action != .read
    #if CUSTODY_FIXTURE
    var output = try fixture(header, configuration, payload)
    #else
    var output = try native(header, configuration, payload)
    #endif
    defer { output.resetBytes(in: 0..<output.count) }
    if header.action == .read {
        guard header.kind == .master ? output.count == 32 : !output.isEmpty && output.count <= 65536 && String(data: output, encoding: .utf8) != nil else { throw Failure.recovery_required }
    } else { guard output.isEmpty else { throw Failure.outcome_unknown } }
    try reply(requestId, nil, output)
} catch {
    try? reply(requestId, error as? Failure ?? (mutatingAttempted ? .outcome_unknown : .invalid_input))
}
