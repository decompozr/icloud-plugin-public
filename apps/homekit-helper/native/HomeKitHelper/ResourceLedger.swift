import Foundation
import CryptoKit
import Darwin
// BEGIN LIFECYCLE SUPPORT -- no HomeKit I/O; policies are tested separately.
final class LifecycleStore {
    private let url: URL
    private let lease: Int32
    init(directory: URL) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700])
        let lock = directory.appendingPathComponent("writer.lock")
        lease = Darwin.open(lock.path, O_RDWR | O_CREAT | O_NOFOLLOW, 0o600)
        guard lease >= 0 else { throw ControlFailure.invalid("LIFECYCLE_LEASE_OPEN_FAILED") }
        guard flock(lease, LOCK_EX | LOCK_NB) == 0 else { Darwin.close(lease); throw ControlFailure.invalid("LIFECYCLE_WRITER_ACTIVE") }
        url = directory.appendingPathComponent("resources.jsonl")
    }
    deinit { flock(lease, LOCK_UN); Darwin.close(lease) }
    func record(homeId: String, id: String, kind: String, state: String, operationId: String, creationVerified: Bool = false) throws {
        let fd = Darwin.open(url.path, O_WRONLY | O_CREAT | O_APPEND | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw ControlFailure.invalid("OWNERSHIP_PERSISTENCE_FAILED") }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close() }
        var data = try JSONSerialization.data(withJSONObject: ["homeId": homeId, "id": id, "kind": kind,
            "state": state, "creationVerified": creationVerified, "creationOperationId": operationId, "timestamp": ISO8601DateFormatter().string(from: Date())], options: [.sortedKeys])
        data.append(10); try handle.write(contentsOf: data); try handle.synchronize()
    }
    func observe(_ record: [String: Any]) throws {
        let target = url.deletingLastPathComponent().appendingPathComponent("provider-observations.jsonl")
        let fd = Darwin.open(target.path, O_WRONLY | O_CREAT | O_APPEND | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw ControlFailure.invalid("OBSERVATION_PERSISTENCE_FAILED") }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? handle.close() }
        var entry = record; entry["timestamp"] = ISO8601DateFormatter().string(from: Date())
        var data = try JSONSerialization.data(withJSONObject: entry, options: [.sortedKeys]); data.append(10)
        try handle.write(contentsOf: data); try handle.synchronize()
    }
    func entry(homeId: String, id: String, kind: String) throws -> [String: Any]? {
        let fd = Darwin.open(url.path, O_RDONLY | O_NOFOLLOW)
        if fd < 0 {
            if errno == ENOENT { return nil }
            throw ControlFailure.invalid("OWNERSHIP_READ_FAILED")
        }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close() }
        let data = try handle.readToEnd() ?? Data()
        guard data.isEmpty || data.last == 10 else { throw ControlFailure.invalid("OWNERSHIP_INCOMPLETE_RECONCILE_REQUIRED") }
        var result: [String: Any]?
        var creationVerified = false
        for line in data.split(separator: 10) {
            guard let record = try JSONSerialization.jsonObject(with: Data(line)) as? [String: Any],
                record["homeId"] is String, record["id"] is String, record["kind"] is String,
                record["creationOperationId"] is String, record["state"] is String else { throw ControlFailure.invalid("OWNERSHIP_CORRUPT") }
            if record["homeId"] as? String == homeId && record["id"] as? String == id && record["kind"] as? String == kind {
                if record["state"] as? String == "owned" || record["creationVerified"] as? Bool == true { creationVerified = true }
                result = record; result?["creationVerified"] = creationVerified
            }
        }
        return result
    }
    func requireOwned(homeId: String, id: String, kind: String) throws -> String {
        guard let record = try entry(homeId: homeId, id: id, kind: kind), record["state"] as? String == "owned",
            let creation = record["creationOperationId"] as? String else { throw ControlFailure.invalid("RESOURCE_NOT_OWNED_OR_UNCERTAIN") }
        return creation
    }
    static func creationCandidate(records: [[String: Any]], homeId: String, operationId: String) throws -> [String: Any] {
        func one(_ phase: String) throws -> [String: Any] {
            let matching = records.filter { $0["phase"] as? String == phase && $0["operationId"] as? String == operationId }
            guard matching.count == 1, matching[0]["homeId"] as? String == homeId else { throw ControlFailure.invalid("CREATION_PROOF_PHASE_OR_HOME_INVALID") }
            return matching[0]
        }
        let before = try one("before-add-trigger"), callback = try one("add-trigger-completion"), readback = try one("independent-manager-readback")
        guard callback["callbackError"] is NSNull, let submitted = before["definition"] as? [String: Any],
            let acknowledged = callback["definition"] as? [String: Any], let expectedName = submitted["name"] as? String,
            UUID(uuidString: operationId) != nil, expectedName.hasPrefix("DecompozR Test \(operationId) "),
            acknowledged["name"] as? String == expectedName, acknowledged["id"] as? String == submitted["id"] as? String,
            let baseline = before["baselineTriggerIds"] as? [String],
            callback["baselineTriggerIds"] as? [String] == baseline, readback["baselineTriggerIds"] as? [String] == baseline,
            let candidates = readback["newDefinitions"] as? [[String: Any]], candidates.count == 1,
            let candidate = candidates.first, let candidateId = candidate["id"] as? String,
            UUID(uuidString: candidateId) != nil, !baseline.contains(candidateId), candidate["homeId"] as? String == homeId,
            candidate["name"] as? String == expectedName, candidate["enabled"] as? Bool == false,
            (candidate["sceneIds"] as? [String])?.isEmpty == true, candidate["kind"] as? String == "event" else { throw ControlFailure.invalid("CREATION_CORRELATION_UNPROVEN") }
        return candidate
    }
    func creationProof(homeId: String, operationId: String) throws -> [String: Any] {
        let path = url.deletingLastPathComponent().appendingPathComponent("provider-observations.jsonl")
        let fd = Darwin.open(path.path, O_RDONLY | O_NOFOLLOW)
        guard fd >= 0 else { throw ControlFailure.invalid("CREATION_PROOF_UNAVAILABLE") }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true); defer { try? handle.close() }
        let data = try handle.readToEnd() ?? Data()
        guard data.last == 10 else { throw ControlFailure.invalid("CREATION_PROOF_INCOMPLETE") }
        let records = try data.split(separator: 10).map { line -> [String: Any] in
            guard let record = try JSONSerialization.jsonObject(with: Data(line)) as? [String: Any] else { throw ControlFailure.invalid("CREATION_PROOF_CORRUPT") }
            return record
        }
        return try Self.creationCandidate(records: records, homeId: homeId, operationId: operationId)
    }
    static func resourceName(_ name: String, operationId: String) throws -> String {
        guard UUID(uuidString: operationId) != nil, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              name.utf8.count <= 120 else { throw ControlFailure.invalid("RESOURCE_NAME_INVALID") }
        return "DecompozR \(name) [\(operationId)]"
    }
    static func actionMatches(_ action: [String: Any], target: [String: Any], value: Any) throws -> Bool {
        guard action["kind"] as? String == "characteristicWrite", action["opaque"] as? Bool == false,
            let actual = action["target"] as? [String: Any], actual["resolved"] as? Bool == true,
            ["homeId", "accessoryId", "serviceId", "characteristicId"].allSatisfy({ actual[$0] as? String == target[$0] as? String && target[$0] is String }),
            let observedValue = action["targetValue"] else { return false }
        if let format = target["format"] as? String, format == "bool" {
            guard actual["format"] as? String == format else { return false }
            let desired = try ControlValue.decode(value, format: format)
            let observed = try ControlValue.decodeProviderTarget(observedValue, format: format)
            guard let desiredBool = desired as? Bool, let observedBool = observed as? Bool else { return false }
            return desiredBool == observedBool
        }
        return try JSONSerialization.data(withJSONObject: [observedValue], options: [.sortedKeys]) == JSONSerialization.data(withJSONObject: [value], options: [.sortedKeys])
    }
    static func addedAction(_ actions: [[String: Any]], baseline: Set<String>, target: [String: Any], value: Any) throws -> String {
        let additions = actions.filter { !baseline.contains($0["id"] as? String ?? "") }
        guard additions.count == 1, let entry = additions.first, let id = entry["id"] as? String,
            UUID(uuidString: id) != nil, try actionMatches(entry, target: target, value: value) else { throw ControlFailure.invalid("ACTION_ADDITION_READBACK_MISMATCH") }
        return id
    }
    static func revision(_ snapshot: [String: Any]) throws -> String {
        var definition = snapshot
        // Execution telemetry is not part of the editable definition.
        definition.removeValue(forKey: "executing"); definition.removeValue(forKey: "lastExecutionDate")
        return SHA256.hash(data: try JSONSerialization.data(withJSONObject: definition, options: [.sortedKeys]))
            .map { String(format: "%02x", $0) }.joined()
    }
    static func requireRevision(_ expected: String?, snapshot: [String: Any]) throws {
        guard let expected = expected, expected == (try revision(snapshot)) else { throw ControlFailure.invalid("DEFINITION_REVISION_MISMATCH") }
    }
}
