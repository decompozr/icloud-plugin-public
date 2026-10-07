import Foundation
import UIKit
import HomeKit
import CoreFoundation
import Darwin
import CryptoKit
import ObjectiveC

// BEGIN PRESENTATION SUPPORT -- Foundation-only launch policy.
enum HelperPresentation {
    static func showsWindow(_ arguments: [String]) -> Bool { arguments.contains("--show-window") }
}
// END PRESENTATION SUPPORT

// Catalyst does not expose AppKit at compile time. Only documented public selectors
// cross this narrow desktop presentation boundary; HomeKit stays in UIKit.
enum DesktopPresentation {
    static func apply() {
        guard !HelperPresentation.showsWindow(CommandLine.arguments),
              let appClass = NSClassFromString("NSApplication"),
              let shared = class_getClassMethod(appClass, NSSelectorFromString("sharedApplication")) else { return }
        typealias Shared = @convention(c) (AnyClass, Selector) -> Unmanaged<AnyObject>
        let app = unsafeBitCast(method_getImplementation(shared), to: Shared.self)(appClass, NSSelectorFromString("sharedApplication")).takeUnretainedValue()
        guard let actualClass = object_getClass(app) else { return }
        if let policy = class_getInstanceMethod(actualClass, NSSelectorFromString("setActivationPolicy:")) {
            typealias Policy = @convention(c) (AnyObject, Selector, Int) -> Bool
            _ = unsafeBitCast(method_getImplementation(policy), to: Policy.self)(app, NSSelectorFromString("setActivationPolicy:"), 1)
        }
        // Catalyst's host window ignores orderOut. Hide the application only once
        // Home access is granted, so initial macOS permission UI remains available.
        if Probe.shared.homeAuthorized, let hide = class_getInstanceMethod(actualClass, NSSelectorFromString("hide:")) {
            typealias Hide = @convention(c) (AnyObject, Selector, AnyObject?) -> Void
            unsafeBitCast(method_getImplementation(hide), to: Hide.self)(app, NSSelectorFromString("hide:"), nil)
        }
    }

    static func schedule() {
        DispatchQueue.main.async { apply() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { apply() }
    }
}


// BEGIN EVENT REPLAY SUPPORT -- Foundation-only bounded reader.
enum EventReplay {
    static let maximumBytes: UInt64 = 16 * 1024 * 1024
    static let maximumRecordBytes = 256 * 1024
    static func scan(_ url: URL, maximumBytes: UInt64 = maximumBytes,
                     visit: ([String: Any]) -> Void) throws -> Int {
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        let end = try file.seekToEnd(), start = end > maximumBytes ? end - maximumBytes : 0
        try file.seek(toOffset: start)
        var remaining = end - start, buffer = Data(), discard = start > 0, errors = 0
        while remaining > 0 {
            let chunk = try file.read(upToCount: Int(min(remaining, 65536))) ?? Data()
            if chunk.isEmpty { errors += 1; break }
            remaining -= UInt64(chunk.count)
            buffer.append(chunk)
            while let newline = buffer.firstIndex(of: 10) {
                let line = Data(buffer[..<newline]); buffer.removeSubrange(...newline)
                if discard { discard = false; continue }
                if line.isEmpty { continue }
                if line.count > maximumRecordBytes { errors += 1; continue }
                if let event = try? JSONSerialization.jsonObject(with: line) as? [String: Any] { visit(event) }
                else { errors += 1 }
            }
            if buffer.count > maximumRecordBytes { buffer.removeAll(keepingCapacity: true); if !discard { errors += 1 }; discard = true }
        }
        if !buffer.isEmpty && !discard { errors += 1 }
        return errors
    }
}
// END EVENT REPLAY SUPPORT

// BEGIN CONTROL SUPPORT -- Foundation-only policy exercised by control-support-test.py.
enum ControlFailure: Error { case invalid(String) }

enum ControlValue {
    static let formats: Set<String> = ["bool", "int", "float", "uint8", "uint16", "uint32", "uint64", "string", "data", "tlv8", "array", "dict"]
    static func decode(_ value: Any, format: String, minimum: NSNumber? = nil, maximum: NSNumber? = nil,
                       step: NSNumber? = nil, validValues: [NSNumber]? = nil, maxLength: NSNumber? = nil) throws -> Any {
        func reject(_ reason: String) throws -> Never { throw ControlFailure.invalid(reason) }
        switch format {
        case "bool":
            guard let n = value as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { try reject("BOOLEAN_REQUIRED") }
            return n.boolValue
        case "int", "float", "uint8", "uint16", "uint32", "uint64":
            let exactUInt64 = (value as? [String: Any]).flatMap { object -> UInt64? in
                guard format == "uint64", Set(object.keys) == ["decimal"], let text = object["decimal"] as? String,
                      !text.isEmpty, text.utf8.allSatisfy({ (48...57).contains($0) }) else { return nil }
                return UInt64(text)
            }
            guard let n = exactUInt64.map({ NSNumber(value: $0) }) ?? (value as? NSNumber),
                  CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite else { try reject("NUMBER_REQUIRED") }
            let v = n.doubleValue
            if format != "float", v.rounded(.towardZero) != v { try reject("INTEGER_REQUIRED") }
            // UInt64 JSON numbers must remain exact; larger values can lose precision in MCP clients.
            let bounds: [String: (Double, Double)] = ["int": (-2147483648, 2147483647), "uint8": (0, 255),
                "uint16": (0, 65535), "uint32": (0, 4294967295), "uint64": (0, 9007199254740991)]
            if exactUInt64 == nil, let (lo, hi) = bounds[format], !(lo...hi).contains(v) { try reject("FORMAT_RANGE_INVALID") }
            if let minimum = minimum, n.compare(minimum) == .orderedAscending { try reject("BELOW_MINIMUM") }
            if let maximum = maximum, n.compare(maximum) == .orderedDescending { try reject("ABOVE_MAXIMUM") }
            if let values = validValues, !values.isEmpty, !values.contains(where: { $0.compare(n) == .orderedSame }) { try reject("ENUM_VALUE_INVALID") }
            if let step = step, step.doubleValue > 0 {
                let offset = (v - (minimum?.doubleValue ?? 0)) / step.doubleValue
                if abs(offset - offset.rounded()) > 1e-7 { try reject("STEP_VALUE_INVALID") }
            }
            return n
        case "string":
            guard let text = value as? String else { try reject("STRING_REQUIRED") }
            if let length = maxLength, text.utf8.count > length.intValue { try reject("STRING_TOO_LONG") }
            return text
        case "data", "tlv8":
            guard let object = value as? [String: Any], Set(object.keys) == ["base64"],
                  let encoded = object["base64"] as? String, let data = Data(base64Encoded: encoded) else { try reject("BASE64_DATA_REQUIRED") }
            if format == "tlv8" {
                let bytes = [UInt8](data); var offset = 0
                while offset < bytes.count {
                    guard offset + 2 <= bytes.count else { try reject("TLV8_TRUNCATED") }
                    offset += 2 + Int(bytes[offset + 1])
                    if offset > bytes.count { try reject("TLV8_TRUNCATED") }
                }
            }
            return data
        case "array":
            guard let array = value as? [Any], JSONSerialization.isValidJSONObject(array) else { try reject("ARRAY_REQUIRED") }
            return array
        case "dict":
            guard let object = value as? [String: Any], JSONSerialization.isValidJSONObject(object) else { try reject("DICTIONARY_REQUIRED") }
            return object
        default: try reject("PROVIDER_FORMAT_UNSUPPORTED")
        }
    }
}

// Each begin holds an interprocess file lock while replaying and reserving the operation.
// A crash after reservation always replays as unknown; it never automatically retries I/O.
final class ControlJournal {
    private let url: URL
    init(url: URL) throws {
        self.url = url
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700])
    }
    private func locked<T>(_ body: (FileHandle) throws -> T) throws -> T {
        let fd = Darwin.open(url.path, O_RDWR | O_CREAT | O_APPEND | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw ControlFailure.invalid("JOURNAL_OPEN_FAILED") }
        let handle = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        defer { try? handle.close() }
        guard flock(fd, LOCK_EX) == 0 else { throw ControlFailure.invalid("JOURNAL_LOCK_FAILED") }
        defer { flock(fd, LOCK_UN) }
        return try body(handle)
    }
    private func append(_ record: [String: Any], to handle: FileHandle) throws {
        var data = try JSONSerialization.data(withJSONObject: record, options: [.sortedKeys])
        guard data.count <= 256 * 1024 else { throw ControlFailure.invalid("JOURNAL_RECORD_LIMIT") }
        data.append(10)
        try handle.write(contentsOf: data)
        try handle.synchronize()
    }
    private func latest(operationId: String, handle: FileHandle) throws -> [String: Any]? {
        try handle.seek(toOffset: 0)
        var buffer = Data(), latest: [String: Any]?
        while let chunk = try handle.read(upToCount: 65536), !chunk.isEmpty {
            buffer.append(chunk)
            while let newline = buffer.firstIndex(of: 10) {
                let line = Data(buffer[..<newline]); buffer.removeSubrange(...newline)
                guard !line.isEmpty, line.count <= 256 * 1024,
                      let record = try JSONSerialization.jsonObject(with: line) as? [String: Any],
                      record["operationId"] is String else { throw ControlFailure.invalid("JOURNAL_CORRUPT_OR_RECORD_LIMIT") }
                if record["operationId"] as? String == operationId { latest = record }
            }
            guard buffer.count <= 256 * 1024 else { throw ControlFailure.invalid("JOURNAL_RECORD_LIMIT") }
        }
        guard buffer.isEmpty else { throw ControlFailure.invalid("JOURNAL_INCOMPLETE_RECONCILE_REQUIRED") }
        return latest
    }
    func outcome(operationId: String, request: [String: Any]) throws -> [String: Any]? {
        let fingerprint = try JSONSerialization.data(withJSONObject: request, options: [.sortedKeys]).base64EncodedString()
        return try locked { handle in
            guard let record = try self.latest(operationId: operationId, handle: handle) else { return nil }
            guard record["fingerprint"] as? String == fingerprint else { throw ControlFailure.invalid("OPERATION_ID_CONFLICT") }
            return (record["result"] as? [String: Any]) ?? ["error": "WRITE_OUTCOME_UNKNOWN", "operationId": operationId]
        }
    }
    func begin(operationId: String, request: [String: Any]) throws -> [String: Any]? {
        guard !operationId.isEmpty, operationId.utf8.count <= 200 else { throw ControlFailure.invalid("OPERATION_ID_REQUIRED") }
        let fingerprint = try JSONSerialization.data(withJSONObject: request, options: [.sortedKeys]).base64EncodedString()
        return try locked { handle in
            let latest = try self.latest(operationId: operationId, handle: handle)
            if let latest = latest {
                guard latest["fingerprint"] as? String == fingerprint else { throw ControlFailure.invalid("OPERATION_ID_CONFLICT") }
                return (latest["result"] as? [String: Any]) ?? ["error": "WRITE_OUTCOME_UNKNOWN", "operationId": operationId]
            }
            try append(["operationId": operationId, "fingerprint": fingerprint, "state": "pending",
                "timestamp": ISO8601DateFormatter().string(from: Date())], to: handle)
            return nil
        }
    }
    func finish(operationId: String, request: [String: Any], result: [String: Any]) throws {
        let fingerprint = try JSONSerialization.data(withJSONObject: request, options: [.sortedKeys]).base64EncodedString()
        try locked { handle in
            try append(["operationId": operationId, "fingerprint": fingerprint, "state": "completed", "result": result,
                "timestamp": ISO8601DateFormatter().string(from: Date())], to: handle)
        }
    }
}
// Public snapshot restrictions shared by production preview and dispatch.
enum ProductionControlPolicy {
    static func scene(_ definition: [String: Any], homeId: String) throws {
        guard definition["homeId"] as? String == homeId,
              definition["actionSetType"] as? String == "HMActionSetTypeUserDefined",
              definition["listedInHome"] as? Bool == true,
              definition["actionsTruncated"] as? Bool == false,
              let references = definition["referencedByTriggerIds"] as? [String], references.isEmpty,
              let actions = definition["actions"] as? [[String: Any]], actions.count <= 64,
              definition["actionCount"] as? Int == actions.count else { throw ControlFailure.invalid("SCENE_UNSUPPORTED_OR_REFERENCED") }
        for action in actions {
            guard action["opaque"] as? Bool == false, action["kind"] as? String == "characteristicWrite",
                  let target = action["target"] as? [String: Any], target["resolved"] as? Bool == true,
                  target["homeId"] as? String == homeId,
                  ["accessoryId", "serviceId", "characteristicId"].allSatisfy({ (target[$0] as? String).flatMap(UUID.init(uuidString:)) != nil })
            else { throw ControlFailure.invalid("SCENE_ACTION_UNSUPPORTED_OR_UNRESOLVED") }
        }
    }
}
// END CONTROL SUPPORT


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
    static func actionMatches(_ action: [String: Any], target: [String: Any], value: Any) throws -> Bool {
        guard action["kind"] as? String == "characteristicWrite", action["opaque"] as? Bool == false,
            let actual = action["target"] as? [String: Any], actual["resolved"] as? Bool == true,
            ["homeId", "accessoryId", "serviceId", "characteristicId"].allSatisfy({ actual[$0] as? String == target[$0] as? String && target[$0] is String }),
            let observedValue = action["targetValue"] else { return false }
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
// END LIFECYCLE SUPPORT

// Callback-owned objects can precede persisted trigger identity/definition updates.
// Independent manager readback must preserve exact IDs; never resolve by display name.
final class LifecycleReadback: NSObject, HMHomeManagerDelegate {
    fileprivate var manager: HMHomeManager!
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

// Development-only local stdio MCP helper. Exact-ID controls; no cloud transport.
// Inspired by the lifecycle/transport patterns documented in README.md; original source.
final class Probe: NSObject, HMHomeManagerDelegate, HMAccessoryDelegate, HMHomeDelegate {
    static let shared = Probe()
    private var manager: HMHomeManager!
    private var ready = false
    private var events: [[String: Any]] = []
    private var sequence = 0
    private var subscriptionFailures: [[String: String]] = []
    private var subscriptionsPending = 0
    private var subscriptionsEnabled = 0
    private let outputLock = NSLock()
    private var readOnly = false
    private var lifecycleRequested = false
    private var productionControls = false
    private var controlInFlight = false
    private var controlJournal: ControlJournal?
    private var controlJournalError: String?
    private var lifecycleStore: LifecycleStore?
    private var lifecycleJournal: ControlJournal?
    private var lifecycleError: String?
    private var lifecycleBusy = false
    private var lifecycleInFlight = false
    private var lifecycleReadback: LifecycleReadback?
    private var lifecycleObservation: [String: Any]?
    private var eventJournal: URL?
    private var eventJournalErrors = 0
    private var resourceSubscribers = Set<String>()
    private let eventSession = UUID().uuidString

    func start() {
        let arguments = ProcessInfo.processInfo.arguments
        if let index = arguments.firstIndex(of: "--pid-file"), arguments.indices.contains(index + 1) {
            let path = arguments[index + 1]
            FileManager.default.createFile(atPath: path,
                contents: String(ProcessInfo.processInfo.processIdentifier).data(using: .utf8),
                attributes: [.posixPermissions: 0o600])
        }
        if let index = arguments.firstIndex(of: "--event-journal"), arguments.indices.contains(index + 1) {
            let url = URL(fileURLWithPath: arguments[index + 1])
            do {
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true,
                    attributes: [.posixPermissions: 0o700])
                if !FileManager.default.fileExists(atPath: url.path) {
                    guard FileManager.default.createFile(atPath: url.path, contents: nil, attributes: [.posixPermissions: 0o600]) else {
                        throw NSError(domain: "HomeKitProbe", code: 1)
                    }
                }
                eventJournal = url
            } catch { eventJournalErrors += 1 }
        }
        readOnly = arguments.contains("--read-only")
        lifecycleRequested = arguments.contains("--lifecycle-directory")
        productionControls = arguments.contains("--production-controls") && lifecycleRequested && !readOnly
        if !readOnly && !lifecycleRequested {
            let defaultURL = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("com.decompozr.homekit-probe/control-operations.jsonl")
            let index = arguments.firstIndex(of: "--control-journal")
            let url = index.flatMap { arguments.indices.contains($0 + 1) ? URL(fileURLWithPath: arguments[$0 + 1]) : nil } ?? defaultURL
            do { controlJournal = try ControlJournal(url: url) }
            catch { controlJournalError = String(describing: error) }
        }
        if !readOnly, let index = arguments.firstIndex(of: "--lifecycle-directory"), arguments.indices.contains(index + 1) {
            do {
                let directory = URL(fileURLWithPath: arguments[index + 1])
                lifecycleStore = try LifecycleStore(directory: directory)
                lifecycleJournal = try ControlJournal(url: directory.appendingPathComponent("operations.jsonl"))
                if productionControls { controlJournal = try ControlJournal(url: directory.appendingPathComponent("control-operations.jsonl")) }
            } catch { lifecycleError = String(describing: error) }
        }
        manager = HMHomeManager()
        manager.delegate = self
        DispatchQueue.global(qos: .utility).async {
            while let line = readLine() {
                guard line.utf8.count <= 1_048_576,
                      let data = line.data(using: .utf8),
                      let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
                else { continue }
                DispatchQueue.main.async { self.handle(request) }
            }
        }
    }

    func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        ready = true
        DesktopPresentation.schedule()
        if lifecycleStore != nil { for home in manager.homes { home.delegate = self } }
    }
    func home(_ home: HMHome, didAdd trigger: HMTrigger) {
        guard let context = lifecycleObservation else { return }
        var record = context; record["phase"] = "home-delegate-did-add-trigger"
        record["homeId"] = home.uniqueIdentifier.uuidString
        record["definition"] = triggerDetail(trigger, home: home)
        try? lifecycleStore?.observe(record)
    }


    private func scalar(_ value: Any?) -> Any {
        guard let value = value else { return NSNull() }
        if let data = value as? Data { return ["base64": data.base64EncodedString()] }
        if let number = value as? NSNumber, CFGetTypeID(number) != CFBooleanGetTypeID(),
           String(cString: number.objCType) == "Q", number.uint64Value > 9007199254740991 {
            return ["decimal": number.stringValue]
        }
        if JSONSerialization.isValidJSONObject([value]) { return value }
        return ["unsupportedValueType": String(describing: type(of: value))]
    }

    private func status() -> [String: Any] {
        ["mode": readOnly ? "native-read-only-experiment" : "native-general-control-experiment", "ready": ready,
         "processId": ProcessInfo.processInfo.processIdentifier, "localUserId": Int(getuid()),
         "presentationMode": HelperPresentation.showsWindow(CommandLine.arguments) ? "window" : "background",
         "visibleWindowCount": UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.filter { !$0.isHidden }.count,
         "authorizationStatus": manager.authorizationStatus.rawValue,
         "authorized": manager.authorizationStatus.contains(.authorized),
         "homeCount": ready ? manager.homes.count : 0,
         "sequence": sequence, "subscriptionFailures": subscriptionFailures,
         "subscriptionsPending": subscriptionsPending, "subscriptionsEnabled": subscriptionsEnabled,
         "eventJournalEnabled": eventJournal != nil, "eventJournalErrors": eventJournalErrors,
         "resourceSubscriptions": resourceSubscribers.count,
         "eventSession": eventSession,
         "lifecycleEnabled": lifecycleStore != nil && lifecycleJournal != nil && lifecycleError == nil,
         "lifecycleError": lifecycleError ?? NSNull(), "physicalControlEnabled": controlEnabled, "controlJournalError": controlJournalError ?? NSNull(),
         "deliveryEnabled": false]
    }

    private func inventory(query: String? = nil) -> [String: Any] {
        let homes: [[String: Any]] = manager.homes.map { home in
            let accessories: [[String: Any]] = home.accessories.compactMap { accessory in
                if let query = query, !query.isEmpty,
                   ![accessory.name, accessory.room?.name ?? "", home.name]
                    .joined(separator: " ").localizedCaseInsensitiveContains(query) { return nil }
                let services: [[String: Any]] = accessory.services.map { service in
                    let characteristics: [[String: Any]] = service.characteristics.map { c in
                        ["id": c.uniqueIdentifier.uuidString, "type": c.characteristicType,
                         "properties": c.properties, "value": scalar(c.value), "valueSource": "cached",
                         "format": c.metadata?.format ?? "", "units": c.metadata?.units ?? "",
                         "minimum": scalar(c.metadata?.minimumValue), "maximum": scalar(c.metadata?.maximumValue),
                         "step": scalar(c.metadata?.stepValue), "maxLength": scalar(c.metadata?.maxLength),
                         "validValues": c.metadata?.validValues ?? [],
                         "writable": c.properties.contains(HMCharacteristicPropertyWritable),
                         "controlValueSupported": ControlValue.formats.contains(c.metadata?.format ?? ""),
                         "notificationsEnabled": c.isNotificationEnabled]
                    }
                    return ["id": service.uniqueIdentifier.uuidString, "name": service.name,
                            "type": service.serviceType, "characteristics": characteristics]
                }
                return ["id": accessory.uniqueIdentifier.uuidString, "name": accessory.name,
                        "roomId": accessory.room?.uniqueIdentifier.uuidString ?? "",
                        "room": accessory.room?.name ?? "", "reachable": accessory.isReachable,
                        "services": services]
            }
            return ["id": home.uniqueIdentifier.uuidString, "name": home.name,
                    "rooms": home.rooms.map { ["id": $0.uniqueIdentifier.uuidString, "name": $0.name] },
                    "zones": home.zones.map { zone in ["id": zone.uniqueIdentifier.uuidString,
                        "name": zone.name, "roomIds": zone.rooms.map { $0.uniqueIdentifier.uuidString }] as [String: Any] },
                    "accessories": accessories,
                    "scenes": home.actionSets.map { ["id": $0.uniqueIdentifier.uuidString,
                        "name": $0.name, "actionCount": $0.actions.count] as [String: Any] },
                    "automations": home.triggers.map { ["id": $0.uniqueIdentifier.uuidString,
                        "name": $0.name, "enabled": $0.isEnabled,
                        "type": String(describing: type(of: $0)),
                        "sceneIds": $0.actionSets.map { $0.uniqueIdentifier.uuidString }] as [String: Any] }]
        }
        return ["status": status(), "homes": homes, "valuesAreFresh": false]
    }


    // Provider object snapshot, not a fresh device read or complete Home app definition.
    private func dateComponents(_ value: DateComponents?) -> Any {
        guard let value = value else { return NSNull() }
        var result: [String: Any] = [:]
        for (key, component) in [("era", value.era), ("year", value.year), ("month", value.month),
            ("day", value.day), ("hour", value.hour), ("minute", value.minute), ("second", value.second),
            ("nanosecond", value.nanosecond), ("weekday", value.weekday), ("weekdayOrdinal", value.weekdayOrdinal),
            ("quarter", value.quarter), ("weekOfMonth", value.weekOfMonth), ("weekOfYear", value.weekOfYear),
            ("yearForWeekOfYear", value.yearForWeekOfYear)] {
            if let component = component { result[key] = component }
        }
        result["calendar"] = value.calendar.map { String(describing: $0.identifier) } ?? NSNull()
        result["timeZone"] = value.timeZone?.identifier ?? NSNull()
        result["isLeapMonth"] = value.isLeapMonth.map { $0 as Any } ?? NSNull()
        return result
    }

    private func reference(_ c: HMCharacteristic, home: HMHome) -> [String: Any] {
        for accessory in home.accessories {
            for service in accessory.services where service.characteristics.contains(where: { $0.uniqueIdentifier == c.uniqueIdentifier }) {
                return ["homeId": home.uniqueIdentifier.uuidString, "accessoryId": accessory.uniqueIdentifier.uuidString,
                    "serviceId": service.uniqueIdentifier.uuidString, "characteristicId": c.uniqueIdentifier.uuidString,
                    "resolved": true, "format": c.metadata?.format ?? NSNull()]
            }
        }
        return ["homeId": home.uniqueIdentifier.uuidString, "characteristicId": c.uniqueIdentifier.uuidString,
            "resolved": false, "reason": "CHARACTERISTIC_NOT_IN_HOME"]
    }

    private func eventDetail(_ event: HMEvent, home: HMHome) -> [String: Any] {
        var result: [String: Any] = ["id": event.uniqueIdentifier.uuidString,
            "providerType": String(describing: type(of: event)), "kind": "opaque", "opaque": true]
        if let e = event as? HMCharacteristicEvent<NSCopying> {
            result.merge(["kind": "characteristic", "opaque": false, "target": reference(e.characteristic, home: home),
                "triggerValue": scalar(e.triggerValue)], uniquingKeysWith: { _, new in new })
        } else if let e = event as? HMCharacteristicThresholdRangeEvent {
            result.merge(["kind": "threshold", "opaque": false, "target": reference(e.characteristic, home: home),
                "minimum": scalar(e.thresholdRange.minValue), "maximum": scalar(e.thresholdRange.maxValue)], uniquingKeysWith: { _, new in new })
        } else if let e = event as? HMCalendarEvent {
            result.merge(["kind": "calendar", "opaque": false, "components": dateComponents(e.fireDateComponents)], uniquingKeysWith: { _, new in new })
        } else if let e = event as? HMSignificantTimeEvent {
            result.merge(["kind": "significantTime", "opaque": false, "significantEvent": e.significantEvent,
                "offset": dateComponents(e.offset)], uniquingKeysWith: { _, new in new })
        } else if let e = event as? HMDurationEvent {
            result.merge(["kind": "duration", "opaque": false, "duration": e.duration], uniquingKeysWith: { _, new in new })
        } else if let e = event as? HMPresenceEvent {
            result.merge(["kind": "presence", "opaque": false, "presenceEventType": e.presenceEventType.rawValue,
                "presenceUserType": e.presenceUserType.rawValue, "identityLimit": "PUBLIC_ENUM_NOT_PERSON_LOCATION_PROOF"], uniquingKeysWith: { _, new in new })
        } else if event is HMLocationEvent {
            result["kind"] = "location"; result["reason"] = "LOCATION_PAYLOAD_NOT_EXPORTED"
        } else { result["reason"] = "EVENT_SUBTYPE_UNSUPPORTED" }
        return result
    }

    private func sceneDetail(_ scene: HMActionSet, home: HMHome) -> [String: Any] {
        let owned = scene.actionSetType == HMActionSetTypeTriggerOwned
        let userDefined = scene.actionSetType == HMActionSetTypeUserDefined
        let actions = scene.actions.sorted { $0.uniqueIdentifier.uuidString < $1.uniqueIdentifier.uuidString }
        let entries: [[String: Any]] = actions.prefix(256).map { action in
            var entry: [String: Any] = ["id": action.uniqueIdentifier.uuidString,
                "providerType": String(describing: type(of: action)), "kind": "opaque", "opaque": true]
            if let write = action as? HMCharacteristicWriteAction<NSCopying> {
                entry.merge(["kind": "characteristicWrite", "opaque": false,
                    "target": reference(write.characteristic, home: home), "targetValue": scalar(write.targetValue)], uniquingKeysWith: { _, new in new })
            } else { entry["reason"] = "ACTION_SUBTYPE_UNSUPPORTED_OR_SHORTCUT_OPAQUE" }
            return entry
        }
        return ["id": scene.uniqueIdentifier.uuidString, "homeId": home.uniqueIdentifier.uuidString,
            "name": scene.name, "actionSetType": scene.actionSetType,
            "listedInHome": home.actionSets.contains(where: { $0.uniqueIdentifier == scene.uniqueIdentifier }),
            "referencedByTriggerIds": home.triggers.filter { $0.actionSets.contains(where: { $0.uniqueIdentifier == scene.uniqueIdentifier }) }.map { $0.uniqueIdentifier.uuidString }.sorted(),
            "executing": scene.isExecuting, "lastExecutionDate": scene.lastExecutionDate.map { ISO8601DateFormatter().string(from: $0) } ?? NSNull(),
            "actions": entries, "actionCount": actions.count, "actionsTruncated": actions.count > 256,
            "publicAPICapabilities": ["execute": !owned, "rename": !owned, "removeFromHome": userDefined,
                "associateWithAnotherTrigger": !owned, "editCharacteristicActions": true],
            "capabilityLimit": "SDK_SURFACE_ONLY_PERMISSION_AND_CALLBACK_ACCEPTANCE_REQUIRED",
            "definitionCompleteness": "PUBLIC_API_ONLY_SHORTCUT_INTERNALS_UNAVAILABLE"]
    }

    private func triggerDetail(_ trigger: HMTrigger, home: HMHome) -> [String: Any] {
        var result: [String: Any] = ["id": trigger.uniqueIdentifier.uuidString, "homeId": home.uniqueIdentifier.uuidString,
            "name": trigger.name, "enabled": trigger.isEnabled, "providerType": String(describing: type(of: trigger)),
            "sceneIds": trigger.actionSets.map { $0.uniqueIdentifier.uuidString }.sorted(), "kind": "opaque",
            "definitionCompleteness": "PUBLIC_API_ONLY", "publicAPICapabilities": ["rename": true, "enable": true, "remove": true],
            "capabilityLimit": "SDK_SURFACE_ONLY_PERMISSION_AND_CALLBACK_ACCEPTANCE_REQUIRED"]
        if let timer = trigger as? HMTimerTrigger {
            result["kind"] = "timer"; result["fireDate"] = ISO8601DateFormatter().string(from: timer.fireDate)
            result["timeZone"] = timer.timeZone?.identifier ?? NSNull()
            result["recurrence"] = dateComponents(timer.recurrence)
            result["recurrenceCalendar"] = timer.recurrenceCalendar.map { String(describing: $0.identifier) } ?? NSNull()
            result["deprecatedFields"] = ["timeZone", "recurrenceCalendar"]
        } else if let event = trigger as? HMEventTrigger {
            result["kind"] = "event"; result["activationState"] = event.triggerActivationState.rawValue
            result["executeOnce"] = event.executeOnce
            result["events"] = event.events.prefix(256).map { eventDetail($0, home: home) }
            result["endEvents"] = event.endEvents.prefix(256).map { eventDetail($0, home: home) }
            result["eventCount"] = event.events.count; result["endEventCount"] = event.endEvents.count
            result["eventsTruncated"] = event.events.count > 256 || event.endEvents.count > 256
            result["recurrences"] = event.recurrences.map { $0.prefix(256).map { dateComponents($0) } } ?? NSNull()
            result["recurrencesTruncated"] = (event.recurrences?.count ?? 0) > 256
            // Never serialize/evaluate predicate text or claim an editable allowlisted condition.
            result["condition"] = event.predicate == nil ? ["kind": "none"] : ["kind": "opaque", "reason": "PREDICATE_NOT_ALLOWLIST_DECODED"]
        } else { result["reason"] = "TRIGGER_SUBTYPE_UNSUPPORTED" }
        return result
    }

    private func automationInventory(_ args: [String: Any]) -> [String: Any] {
        guard Set(args.keys).isSubset(of: ["homeId", "offset", "limit"]), let homeId = args["homeId"] as? String,
            let home = manager.homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }) else { return ["error": "HOME_NOT_FOUND_OR_ARGUMENTS_INVALID"] }
        let offsetValue = args["offset"] ?? 0, limitValue = args["limit"] ?? 25
        guard let offset = try? ControlValue.decode(offsetValue, format: "int", minimum: 0, maximum: 1000000) as? NSNumber,
            let limit = try? ControlValue.decode(limitValue, format: "int", minimum: 1, maximum: 25) as? NSNumber else { return ["error": "PAGE_ARGUMENTS_INVALID"] }
        var sets: [UUID: HMActionSet] = [:]
        for set in home.actionSets + home.triggers.flatMap({ $0.actionSets }) { sets[set.uniqueIdentifier] = set }
        let scenes = sets.values.sorted { $0.uniqueIdentifier.uuidString < $1.uniqueIdentifier.uuidString }
        let triggers = home.triggers.sorted { $0.uniqueIdentifier.uuidString < $1.uniqueIdentifier.uuidString }
        let start = offset.intValue, size = limit.intValue, total = max(scenes.count, triggers.count)
        return ["schemaVersion": 1, "homeId": homeId, "valueSource": "provider-object-snapshot",
            "valuesAreFresh": false, "offset": start, "limit": size,
            "nextOffset": start + size < total ? start + size as Any : NSNull(),
            "sceneCount": scenes.count, "automationCount": triggers.count,
            "scenes": scenes.dropFirst(start).prefix(size).map { sceneDetail($0, home: home) },
            "automations": triggers.dropFirst(start).prefix(size).map { triggerDetail($0, home: home) },
            "consistency": "PAGES_NOT_ATOMIC_RESTART_IF_PROVIDER_CHANGES", "controlsAvailable": false]
    }

    private func subscribe(homeId: String, accessoryIds: Set<String>) {
        for home in manager.homes {
            if home.uniqueIdentifier.uuidString != homeId { continue }
            for accessory in home.accessories {
                if !accessoryIds.contains(accessory.uniqueIdentifier.uuidString) { continue }
                accessory.delegate = self
                for service in accessory.services {
                    for c in service.characteristics where c.properties.contains(HMCharacteristicPropertySupportsEventNotification) {
                        if c.isNotificationEnabled { continue }
                        subscriptionsPending += 1
                        c.enableNotification(true) { error in
                            DispatchQueue.main.async {
                                self.subscriptionsPending -= 1
                                if let error = error {
                                    self.subscriptionFailures.append(["characteristicId": c.uniqueIdentifier.uuidString,
                                        "error": String(describing: error)])
                                } else {
                                    self.subscriptionsEnabled += 1
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    func accessory(_ accessory: HMAccessory, service: HMService, didUpdateValueFor characteristic: HMCharacteristic) {
        // Delegate updates are observed events, not user-visible notification delivery.
        sequence += 1
        let event: [String: Any] = ["session": eventSession, "sequence": sequence, "at": ISO8601DateFormatter().string(from: Date()),
            "homeId": manager.homes.first(where: { $0.accessories.contains(accessory) })?.uniqueIdentifier.uuidString ?? "",
            "accessoryId": accessory.uniqueIdentifier.uuidString, "serviceId": service.uniqueIdentifier.uuidString,
            "characteristicId": characteristic.uniqueIdentifier.uuidString,
            "accessoryName": accessory.name, "room": accessory.room?.name ?? "", "serviceName": service.name,
            "characteristicType": characteristic.characteristicType, "format": characteristic.metadata?.format ?? "",
            "eventType": "characteristic_update", "valueAvailable": characteristic.value != nil,
            "semanticTrust": "provider-value-only",
            "value": scalar(characteristic.value)]
        if let url = eventJournal {
            do {
                var data = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys])
                data.append(10)
                let file = try FileHandle(forWritingTo: url)
                file.seekToEndOfFile(); file.write(data); file.synchronizeFile(); file.closeFile()
            } catch { eventJournalErrors += 1 }
        }
        events.append(event)
        if events.count > 256 { events.removeFirst(events.count - 256) }
        let signalURI = eventURI(event)
        for uri in resourceSubscribers where uri == "homekit://events/all" || uri == signalURI {
            emit(["jsonrpc": "2.0", "method": "notifications/resources/updated", "params": ["uri": uri]])
        }
    }

    private func eventURI(_ event: [String: Any]) -> String {
        "homekit://events/" + ["homeId", "accessoryId", "serviceId", "characteristicId"].map { event[$0] as? String ?? "" }.joined(separator: "/")
    }

    private func resourceCatalogue() -> [[String: Any]] {
        var items: [[String: Any]] = [["uri": "homekit://events/all", "name": "All HomeKit events",
            "description": "Observed characteristic callbacks; raw values may be null. No inferred completion or presence.", "mimeType": "application/json"]]
        for home in manager.homes { for a in home.accessories { for s in a.services {
            for c in s.characteristics where c.properties.contains(HMCharacteristicPropertySupportsEventNotification) {
                let uri = eventURI(["homeId": home.uniqueIdentifier.uuidString, "accessoryId": a.uniqueIdentifier.uuidString,
                    "serviceId": s.uniqueIdentifier.uuidString, "characteristicId": c.uniqueIdentifier.uuidString])
                items.append(["uri": uri, "name": "\(a.room?.name ?? home.name)/\(a.name)/\(s.name)/\(c.characteristicType)",
                    "mimeType": "application/json"])
            }
        } } }
        return items
    }

    private func resourceAddress(_ uri: String) -> (String, Int)? {
        guard let parts = URLComponents(string: uri), parts.scheme == "homekit", parts.host == "events",
              parts.fragment == nil, parts.user == nil, parts.password == nil, parts.port == nil else { return nil }
        let query = parts.queryItems ?? []
        guard query.count <= 1, query.allSatisfy({ $0.name == "after" }),
              let after = Int(query.first?.value ?? "0"), after >= 0 else { return nil }
        let base = "homekit://events" + parts.path
        guard resourceCatalogue().contains(where: { $0["uri"] as? String == base }) else { return nil }
        return (base, after)
    }

    private func resourcePage(uri: String, after: Int) -> [String: Any] {
        // Bound retained replay memory and disk read work. Old cursors receive a gap.
        var bySequence: [Int: [String: Any]] = [:], replayErrors = 0
        var firstAvailable = sequence + 1
        let homes = Set(manager.homes.map { $0.uniqueIdentifier.uuidString })
        func consider(_ event: [String: Any]) {
            guard event["session"] as? String == eventSession, let number = event["sequence"] as? Int else { return }
            firstAvailable = min(firstAvailable, number)
            guard number > after, homes.contains(event["homeId"] as? String ?? ""),
                  uri == "homekit://events/all" || eventURI(event) == uri else { return }
            bySequence[number] = event
            if bySequence.count > 257, let last = bySequence.keys.max() { bySequence.removeValue(forKey: last) }
        }
        if let journal = eventJournal {
            do { replayErrors = try EventReplay.scan(journal, visit: consider) }
            catch { replayErrors += 1 }
        }
        for event in events { consider(event) }
        let matching = bySequence.keys.sorted().compactMap { bySequence[$0] }
        let page = Array(matching.prefix(256))
        return ["session": eventSession, "events": page,
            "cursor": page.last?["sequence"] as? Int ?? after, "headSequence": sequence,
            "hasMore": matching.count > page.count, "gap": replayErrors > 0 || after < firstAvailable - 1,
            "durable": eventJournal != nil && eventJournalErrors == 0 && replayErrors == 0, "journalErrors": eventJournalErrors + replayErrors,
            "semantics": "raw-characteristic-events", "notificationDelivered": false]
    }

    private func handleResource(id: Any, method: String, params: [String: Any]) {
        guard ready && manager.authorizationStatus.contains(.authorized) else {
            emit(["jsonrpc": "2.0", "id": id, "error": ["code": -32000, "message": "HomeKit not ready or authorized"]]); return
        }
        if method == "resources/list" {
            let offset = Int(params["cursor"] as? String ?? "0") ?? -1
            let items = resourceCatalogue()
            guard offset >= 0 && offset <= items.count else {
                emit(["jsonrpc": "2.0", "id": id, "error": ["code": -32602, "message": "Invalid cursor"]]); return
            }
            let page = Array(items.dropFirst(offset).prefix(100))
            var result: [String: Any] = ["resources": page]
            if offset + page.count < items.count { result["nextCursor"] = String(offset + page.count) }
            emit(["jsonrpc": "2.0", "id": id, "result": result]); return
        }
        guard let uri = params["uri"] as? String, let (base, after) = resourceAddress(uri),
              method == "resources/read" || uri == base else {
            emit(["jsonrpc": "2.0", "id": id, "error": ["code": -32002, "message": "Resource not found"]]); return
        }
        switch method {
        case "resources/subscribe":
            resourceSubscribers.insert(base)
            for home in manager.homes {
                let ids = home.accessories.filter { a in
                    base == "homekit://events/all" || base.contains("/\(home.uniqueIdentifier.uuidString)/\(a.uniqueIdentifier.uuidString)/")
                }.map { $0.uniqueIdentifier.uuidString }
                subscribe(homeId: home.uniqueIdentifier.uuidString, accessoryIds: Set(ids))
            }
            emit(["jsonrpc": "2.0", "id": id, "result": [:]])
        case "resources/unsubscribe":
            resourceSubscribers.remove(base)
            emit(["jsonrpc": "2.0", "id": id, "result": [:]])
        case "resources/read":
            let data = (try? JSONSerialization.data(withJSONObject: resourcePage(uri: base, after: after), options: [.sortedKeys])) ?? Data()
            emit(["jsonrpc": "2.0", "id": id, "result": ["contents": [["uri": uri, "mimeType": "application/json",
                "text": String(data: data, encoding: .utf8) ?? "{}"]]]])
        default: break
        }
    }

    private func emit(_ object: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]) else { return }
        outputLock.lock(); defer { outputLock.unlock() }
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([10]))
    }

    private func handle(_ request: [String: Any]) {
        guard let id = request["id"] else { return }
        guard request["jsonrpc"] as? String == "2.0", let method = request["method"] as? String else {
            emit(["jsonrpc": "2.0", "id": id, "error": ["code": -32600, "message": "Invalid request"]]); return
        }
        let params = request["params"] as? [String: Any] ?? [:]
        switch method {
        case "initialize":
            emit(["jsonrpc": "2.0", "id": id, "result": ["protocolVersion": "2024-11-05",
                "capabilities": ["tools": [:], "resources": ["subscribe": true]],
                "serverInfo": ["name": "homekit-experiment-probe", "version": "0.15.0",
                    "sourceSHA256": Bundle.main.object(forInfoDictionaryKey: "HomeKitSourceSHA256") as? String ?? "unbound"]]])
        case "ping": emit(["jsonrpc": "2.0", "id": id, "result": [:]])
        case "resources/list", "resources/read", "resources/subscribe", "resources/unsubscribe":
            handleResource(id: id, method: method, params: params)
        case "tools/list":
            var tools: [[String: Any]] = [
                ["name": "homekit_status", "description": "Read authorization and readiness; no device control.",
                 "inputSchema": ["type": "object", "properties": [:], "additionalProperties": false]],
                ["name": "homekit_list", "description": "List cached home inventory, capabilities, scenes and exposed triggers.",
                 "inputSchema": ["type": "object", "properties": [:], "additionalProperties": false]],
                ["name": "homekit_automation_inventory", "description": "Bounded rich public-API scene/trigger snapshot including trigger-owned action sets and opaque definitions. Read-only.",
                 "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"],
                    "offset": ["type": "integer", "minimum": 0, "maximum": 1000000],
                    "limit": ["type": "integer", "minimum": 1, "maximum": 25]], "required": ["homeId"], "additionalProperties": false]],
                ["name": "homekit_lifecycle_preview", "description": "Read exact scene/automation definition and revision; reports task-owned status, never mutates.",
                 "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"], "resourceId": ["type": "string"],
                    "kind": ["type": "string", "enum": ["scene", "automation"]]], "required": ["homeId", "resourceId", "kind"], "additionalProperties": false]],
                ["name": "homekit_search", "description": "Search cached accessories by name, room or home.",
                 "inputSchema": ["type": "object", "properties": ["query": ["type": "string"]],
                    "required": ["query"], "additionalProperties": false]],
                ["name": "homekit_read", "description": "Fresh read of one exact home/accessory/service/characteristic target. No writes.",
                 "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"],
                    "accessoryId": ["type": "string"], "serviceId": ["type": "string"],
                    "characteristicId": ["type": "string"]],
                    "required": ["homeId", "accessoryId", "serviceId", "characteristicId"], "additionalProperties": false]],
                ["name": "homekit_events", "description": "Inspect buffered events or enable characteristic observations. No delivery.",
                 "inputSchema": ["type": "object", "properties": ["subscribe": ["type": "boolean"],
                    "homeId": ["type": "string"], "accessoryIds": ["type": "array", "items": ["type": "string"]],
                    "after": ["type": "integer", "minimum": 0]], "additionalProperties": false]]
            ]
            if !readOnly && lifecycleStore != nil && lifecycleJournal != nil && lifecycleError == nil {
                tools.append(["name": "homekit_lifecycle_recover_creation", "description": "Ledger-only recovery using retained successful callback, random operation marker, baseline IDs and one independent addition. Does not recover by name alone or retry Home writes.",
                    "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"], "creationOperationId": ["type": "string"], "resourceId": ["type": "string"], "expectedRevision": ["type": "string"]], "required": ["homeId", "creationOperationId", "resourceId", "expectedRevision"], "additionalProperties": false]])
                tools.append(["name": "homekit_lifecycle_reconcile", "description": "Reconcile exact previously confirmed task-owned uncertain resource against a new revision; no Home mutation and no retry of original operation.",
                    "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"], "kind": ["type": "string", "enum": ["scene", "automation"]],
                        "resourceId": ["type": "string"], "expectedRevision": ["type": "string"]], "required": ["homeId", "kind", "resourceId", "expectedRevision"], "additionalProperties": false]])
                tools.append(["name": "homekit_lifecycle_mutate", "description": "Development-only task-owned scenes and disabled event triggers. Exact-ID revision-checked edits; no enable/execute.",
                    "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"], "operationId": ["type": "string"],
                        "action": ["type": "string", "enum": ["createScene", "createAutomation", "rename", "addAction", "updateAction", "removeAction", "updateEvents", "linkScene", "unlinkScene", "delete"]],
                        "kind": ["type": "string", "enum": ["scene", "automation"]], "resourceId": ["type": "string"],
                        "expectedRevision": ["type": "string"], "name": ["type": "string"], "events": ["type": "array", "maxItems": 16],
                        "sceneId": ["type": "string"], "actionId": ["type": "string"], "target": ["type": "object"], "value": [:]],
                        "required": ["homeId", "operationId", "action"], "additionalProperties": false]])
            }
            if productionControls && controlEnabled {
                tools.append(["name": "homekit_control_outcome", "description": "Read retained exact operation journal evidence without provider mutation or retry.", "inputSchema": ["type": "object"]])
                tools.append(["name": "homekit_control_preview", "description": "Review an exact production target and revision; app-owned definitions only; no physical operation.", "inputSchema": ["type": "object"]])
                tools.append(["name": "homekit_control_apply", "description": "Revision-checked production control with durable operation reservation; no automatic retry.", "inputSchema": ["type": "object"]])
            } else if controlEnabled {
                let identifiers: [String: Any] = ["homeId": ["type": "string"], "accessoryId": ["type": "string"],
                    "serviceId": ["type": "string"], "characteristicId": ["type": "string"], "operationId": ["type": "string"]]
                var properties = identifiers
                properties["value"] = ["description": "Desired value matching inventory metadata. Binary data uses {base64: string}; large uint64 uses {decimal: string}.",
                    "oneOf": [["type": "boolean"], ["type": "number"], ["type": "string"], ["type": "array"], ["type": "object"]]]
                tools.append(["name": "homekit_write", "description": "Write any writable HomeKit characteristic by exact IDs. Supply a unique operationId; replay never repeats provider I/O. Readback verifies requested value, not physical completion.",
                    "inputSchema": ["type": "object", "properties": properties,
                        "required": Array(identifiers.keys) + ["value"], "additionalProperties": false]])
                tools.append(["name": "homekit_execute_scene", "description": "Execute an existing scene by exact home/scene IDs. Acknowledgment does not verify all physical outcomes.",
                    "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"],
                        "sceneId": ["type": "string"], "operationId": ["type": "string"]],
                        "required": ["homeId", "sceneId", "operationId"], "additionalProperties": false]])
                tools.append(["name": "homekit_set_automation_enabled", "description": "Enable or disable an existing exposed HomeKit automation by exact IDs.",
                    "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"],
                        "automationId": ["type": "string"], "enabled": ["type": "boolean"], "operationId": ["type": "string"]],
                        "required": ["homeId", "automationId", "enabled", "operationId"], "additionalProperties": false]])
            }
            emit(["jsonrpc": "2.0", "id": id, "result": ["tools": tools]])
        case "tools/call":
            let args = params["arguments"] as? [String: Any] ?? [:]
            let name = params["name"] as? String ?? ""
            var payload: [String: Any]
            var failed = false
            if name == "homekit_status" { payload = status() }
            else if !ready || !manager.authorizationStatus.contains(.authorized) {
                payload = ["error": "HOMEKIT_NOT_READY_OR_AUTHORIZED", "status": status()]; failed = true
            } else if name == "homekit_list" { payload = inventory() }
            else if name == "homekit_automation_inventory" { payload = automationInventory(args); failed = payload["error"] != nil }
            else if name == "homekit_lifecycle_preview" {
                do { payload = try lifecyclePreview(args) } catch { payload = ["error": String(describing: error)]; failed = true }
            }
            else if name == "homekit_lifecycle_recover_creation" {
                do { payload = try lifecycleRecoverCreation(args) } catch { payload = ["error": String(describing: error)]; failed = true }
            }
            else if name == "homekit_lifecycle_reconcile" {
                do { payload = try lifecycleReconcile(args) } catch { payload = ["error": String(describing: error)]; failed = true }
            }
            else if name == "homekit_lifecycle_mutate" { lifecycleMutate(id: id, args: args); return }
            else if name == "homekit_search", let query = args["query"] as? String { payload = inventory(query: query) }
            else if name == "homekit_control_preview" {
                do { payload = try productionControlPreview(args) } catch { payload = ["error": String(describing: error)]; failed = true }
            }
            else if name == "homekit_control_outcome" {
                do { payload = try productionControlOutcome(args) } catch { payload = ["error": String(describing: error)]; failed = true }
            }
            else if name == "homekit_control_apply" {
                guard productionControls else { reply(id: id, payload: ["error": "PRODUCTION_CONTROL_DISABLED"], failed: true); return }
                var target = args; target.removeValue(forKey: "action")
                let tool = args["action"] as? String == "write" ? "homekit_write" : args["action"] as? String == "executeScene" ? "homekit_execute_scene" : args["action"] as? String == "setAutomationEnabled" ? "homekit_set_automation_enabled" : "invalid"
                guard tool != "invalid" else { reply(id: id, payload: ["error": "INVALID_CONTROL_ACTION"], failed: true); return }
                control(id: id, name: tool, args: target, productionIntent: args); return
            }
            else if ["homekit_write", "homekit_execute_scene", "homekit_set_automation_enabled"].contains(name) {
                guard !productionControls else { reply(id: id, payload: ["error": "PRODUCTION_REVIEW_REQUIRED"], failed: true); return }
                control(id: id, name: name, args: args); return
            }
            else if name == "homekit_read" {
                guard let homeId = args["homeId"] as? String, let accessoryId = args["accessoryId"] as? String,
                      let serviceId = args["serviceId"] as? String, let characteristicId = args["characteristicId"] as? String,
                      let home = manager.homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }),
                      let accessory = home.accessories.first(where: { $0.uniqueIdentifier.uuidString == accessoryId }),
                      let service = accessory.services.first(where: { $0.uniqueIdentifier.uuidString == serviceId }),
                      let c = service.characteristics.first(where: { $0.uniqueIdentifier.uuidString == characteristicId }),
                      c.properties.contains(HMCharacteristicPropertyReadable) else {
                    reply(id: id, payload: ["error": "TARGET_UNRESOLVED_OR_NOT_READABLE"], failed: true); return
                }
                var replied = false
                let timeout = DispatchWorkItem {
                    if replied { return }; replied = true
                    self.reply(id: id, payload: ["error": "READ_TIMEOUT"], failed: true)
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: timeout)
                c.readValue { error in
                    DispatchQueue.main.async {
                        if replied { return }; replied = true; timeout.cancel()
                        self.reply(id: id, payload: ["homeId": homeId, "accessoryId": accessoryId,
                            "serviceId": serviceId, "characteristicId": characteristicId,
                            "value": self.scalar(c.value), "valueSource": "fresh-read",
                            "error": error.map { String(describing: $0) } ?? NSNull()], failed: error != nil)
                    }
                }
                return
            }
            else if name == "homekit_events" {
                if args["subscribe"] as? Bool == true {
                    guard let homeId = args["homeId"] as? String,
                          let ids = args["accessoryIds"] as? [String], !ids.isEmpty,
                          let home = manager.homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }),
                          ids.allSatisfy({ id in home.accessories.contains(where: { $0.uniqueIdentifier.uuidString == id }) }) else {
                        reply(id: id, payload: ["error": "SUBSCRIPTION_TARGETS_REQUIRED"], failed: true); return
                    }
                    subscribe(homeId: homeId, accessoryIds: Set(ids))
                }
                let after = args["after"] as? Int ?? 0
                let first = events.first?["sequence"] as? Int ?? (sequence + 1)
                payload = ["events": events.filter { ($0["sequence"] as? Int ?? 0) > after },
                    "sequence": sequence, "gap": after < first - 1, "durable": false,
                    "subscriptionRequested": args["subscribe"] as? Bool ?? false, "status": status()]
            } else { payload = ["error": "UNKNOWN_TOOL_OR_INVALID_ARGUMENTS"]; failed = true }
            reply(id: id, payload: payload, failed: failed)
        default: emit(["jsonrpc": "2.0", "id": id, "error": ["code": -32601, "message": "Method not found"]])
        }
    }
    private func lifecycleDefinition(home: HMHome, kind: String, resourceId: String) throws -> [String: Any] {
        if kind == "scene", let scene = (home.actionSets + home.triggers.flatMap { $0.actionSets }).first(where: { $0.uniqueIdentifier.uuidString == resourceId }) {
            return sceneDetail(scene, home: home)
        }
        if kind == "automation", let trigger = home.triggers.first(where: { $0.uniqueIdentifier.uuidString == resourceId }) {
            return triggerDetail(trigger, home: home)
        }
        throw ControlFailure.invalid("RESOURCE_NOT_FOUND")
    }

    private func lifecyclePreview(_ args: [String: Any]) throws -> [String: Any] {
        guard Set(args.keys) == ["homeId", "kind", "resourceId"], let homeId = args["homeId"] as? String,
            let kind = args["kind"] as? String, let resourceId = args["resourceId"] as? String,
            let home = manager.homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }) else { throw ControlFailure.invalid("PREVIEW_ARGUMENTS_OR_HOME_INVALID") }
        let definition = try lifecycleDefinition(home: home, kind: kind, resourceId: resourceId)
        let entry = try lifecycleStore?.entry(homeId: homeId, id: resourceId, kind: kind)
        return ["definition": definition, "revision": try LifecycleStore.revision(definition),
            "owned": entry?["state"] as? String == "owned", "ownershipState": entry?["state"] ?? "unowned",
            "valueSource": "provider-object-snapshot", "physicalCompletionVerified": false]
    }

    private func lifecycleCharacteristic(_ target: [String: Any], home: HMHome) throws -> HMCharacteristic {
        guard Set(target.keys) == ["accessoryId", "serviceId", "characteristicId"],
            let accessoryId = target["accessoryId"] as? String, let serviceId = target["serviceId"] as? String,
            let characteristicId = target["characteristicId"] as? String,
            let accessory = home.accessories.first(where: { $0.uniqueIdentifier.uuidString == accessoryId }),
            let service = accessory.services.first(where: { $0.uniqueIdentifier.uuidString == serviceId }),
            let characteristic = service.characteristics.first(where: { $0.uniqueIdentifier.uuidString == characteristicId }) else { throw ControlFailure.invalid("EXACT_CHARACTERISTIC_UNRESOLVED") }
        return characteristic
    }

    private func lifecycleEvents(_ values: Any?, home: HMHome, existing: [HMEvent]? = nil) throws -> [HMEvent] {
        guard let values = values as? [[String: Any]], (1...16).contains(values.count) else { throw ControlFailure.invalid("EVENTS_REQUIRED_OR_LIMIT") }
        if let existing = existing {
            let ids = values.compactMap { $0["eventId"] as? String }
            guard ids.count == values.count, Set(ids).count == ids.count, Set(ids) == Set(existing.map { $0.uniqueIdentifier.uuidString }) else { throw ControlFailure.invalid("UPDATE_REQUIRES_EXACT_EXISTING_EVENT_IDS") }
        }
        return try values.map { input in
            var value = input
            let original = existing?.first(where: { $0.uniqueIdentifier.uuidString == value["eventId"] as? String })
            value.removeValue(forKey: "eventId")
            if value["kind"] as? String == "calendar" {
                guard Set(value.keys) == ["kind", "hour", "minute", "timeZone"], (value["timeZone"] is NSNull || (value["timeZone"] as? String).flatMap { TimeZone(identifier: $0) } != nil),
                    let hour = try ControlValue.decode(value["hour"] ?? NSNull(), format: "int", minimum: 0, maximum: 23) as? NSNumber,
                    let minute = try ControlValue.decode(value["minute"] ?? NSNull(), format: "int", minimum: 0, maximum: 59) as? NSNumber else { throw ControlFailure.invalid("CALENDAR_EVENT_INVALID") }
                var components = DateComponents(); components.hour = hour.intValue; components.minute = minute.intValue
                components.timeZone = (value["timeZone"] as? String).flatMap { TimeZone(identifier: $0) }
                if let existing = existing {
                    guard !existing.isEmpty, let calendar = original as? HMCalendarEvent,
                        let mutable = calendar.mutableCopy() as? HMMutableCalendarEvent else { throw ControlFailure.invalid("CALENDAR_EVENT_TYPE_MISMATCH") }
                    mutable.fireDateComponents = components; return mutable
                }
                return HMCalendarEvent(fire: components)
            }
            if value["kind"] as? String == "characteristic" {
                guard Set(value.keys) == ["kind", "target", "value"], let target = value["target"] as? [String: Any] else { throw ControlFailure.invalid("CHARACTERISTIC_EVENT_INVALID") }
                let c = try lifecycleCharacteristic(target, home: home)
                guard c.properties.contains(HMCharacteristicPropertySupportsEventNotification) else { throw ControlFailure.invalid("EVENT_NOT_NOTIFIABLE") }
                let decoded = try ControlValue.decode(value["value"] ?? NSNull(), format: c.metadata?.format ?? "", minimum: c.metadata?.minimumValue,
                    maximum: c.metadata?.maximumValue, step: c.metadata?.stepValue, validValues: c.metadata?.validValues, maxLength: c.metadata?.maxLength)
                guard let copied = decoded as? NSCopying else { throw ControlFailure.invalid("EVENT_VALUE_NOT_COPYABLE") }
                if existing != nil {
                    guard let characteristic = original as? HMCharacteristicEvent<NSCopying>,
                        let mutable = characteristic.mutableCopy() as? HMMutableCharacteristicEvent<NSCopying> else { throw ControlFailure.invalid("CHARACTERISTIC_EVENT_TYPE_MISMATCH") }
                    mutable.characteristic = c; mutable.triggerValue = copied; return mutable
                }
                return HMCharacteristicEvent<NSCopying>(characteristic: c, triggerValue: copied)
            }
            throw ControlFailure.invalid("EVENT_KIND_NOT_ALLOWLISTED")
        }
    }

    private func requireEditableScene(_ scene: HMActionSet, home: HMHome) throws {
        guard scene.actionSetType == HMActionSetTypeUserDefined, scene.actions.count <= 256,
            scene.actions.allSatisfy({ $0 is HMCharacteristicWriteAction<NSCopying> }),
            !home.triggers.contains(where: { $0.isEnabled && $0.actionSets.contains(where: { $0.uniqueIdentifier == scene.uniqueIdentifier }) }) else { throw ControlFailure.invalid("SCENE_RESTRICTED_OPAQUE_OR_ACTIVE_REFERENCE") }
        for action in scene.actions {
            if let write = action as? HMCharacteristicWriteAction<NSCopying>, reference(write.characteristic, home: home)["resolved"] as? Bool != true {
                throw ControlFailure.invalid("SCENE_REFERENCE_UNRESOLVED")
            }
        }
    }

    private func requireEditableTrigger(_ trigger: HMEventTrigger, home: HMHome) throws {
        guard !trigger.isEnabled, trigger.predicate == nil, trigger.endEvents.isEmpty,
            trigger.recurrences == nil, !trigger.executeOnce, trigger.events.count <= 16,
            trigger.events.allSatisfy({ $0 is HMCalendarEvent || $0 is HMCharacteristicEvent<NSCopying> }) else { throw ControlFailure.invalid("TRIGGER_ACTIVE_OPAQUE_OR_OUTSIDE_SLICE") }
        for event in trigger.events {
            if let e = event as? HMCharacteristicEvent<NSCopying>, reference(e.characteristic, home: home)["resolved"] as? Bool != true { throw ControlFailure.invalid("EVENT_REFERENCE_UNRESOLVED") }
        }
    }

    private func lifecycleRecoverCreation(_ args: [String: Any]) throws -> [String: Any] {
        guard !readOnly, !lifecycleBusy, !lifecycleInFlight, let store = lifecycleStore, lifecycleError == nil,
            Set(args.keys) == ["homeId", "creationOperationId", "resourceId", "expectedRevision"],
            let homeId = args["homeId"] as? String, let creation = args["creationOperationId"] as? String,
            let resourceId = args["resourceId"] as? String,
            let home = manager.homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }) else { throw ControlFailure.invalid("CREATION_RECOVERY_ARGUMENTS_INVALID") }
        let proof = try store.creationProof(homeId: homeId, operationId: creation)
        guard proof["id"] as? String == resourceId, let trigger = home.triggers.first(where: { $0.uniqueIdentifier.uuidString == resourceId }) as? HMEventTrigger,
            trigger.name == proof["name"] as? String, !trigger.isEnabled, trigger.actionSets.isEmpty else { throw ControlFailure.invalid("CREATION_RECOVERY_IDENTITY_CHANGED") }
        try requireEditableTrigger(trigger, home: home)
        let current = triggerDetail(trigger, home: home)
        try LifecycleStore.requireRevision(args["expectedRevision"] as? String, snapshot: current)
        try store.record(homeId: homeId, id: resourceId, kind: "automation", state: "owned", operationId: creation, creationVerified: true)
        return ["creationOwnershipVerified": true, "homeMutationAttempted": false, "definition": current,
            "revision": try LifecycleStore.revision(current), "proof": "UNIQUE_OPERATION_CALLBACK_BASELINE_AND_INDEPENDENT_ADDITION", "originalOperationNotRetried": true]
    }

    private func lifecycleReconcile(_ args: [String: Any]) throws -> [String: Any] {
        guard !readOnly, !lifecycleBusy, !lifecycleInFlight, lifecycleError == nil, let store = lifecycleStore,
            Set(args.keys) == ["homeId", "kind", "resourceId", "expectedRevision"], let homeId = args["homeId"] as? String,
            let resourceId = args["resourceId"] as? String, let kind = args["kind"] as? String,
            let home = manager.homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }),
            let entry = try store.entry(homeId: homeId, id: resourceId, kind: kind), entry["state"] as? String == "uncertain",
            entry["creationVerified"] as? Bool == true, let creation = entry["creationOperationId"] as? String else { throw ControlFailure.invalid("RECONCILIATION_OWNERSHIP_OR_BUSY_INVALID") }
        let snapshot = try lifecycleDefinition(home: home, kind: kind, resourceId: resourceId)
        try LifecycleStore.requireRevision(args["expectedRevision"] as? String, snapshot: snapshot)
        if kind == "scene", let scene = home.actionSets.first(where: { $0.uniqueIdentifier.uuidString == resourceId }) { try requireEditableScene(scene, home: home) }
        else if kind == "automation", let trigger = home.triggers.first(where: { $0.uniqueIdentifier.uuidString == resourceId }) as? HMEventTrigger { try requireEditableTrigger(trigger, home: home) }
        else { throw ControlFailure.invalid("RECONCILIATION_UNSUPPORTED_RESOURCE") }
        try store.record(homeId: homeId, id: resourceId, kind: kind, state: "owned", operationId: creation)
        return ["reconciled": true, "homeMutationAttempted": false, "definition": snapshot,
            "revision": try LifecycleStore.revision(snapshot), "operationOutcome": "ORIGINAL_RECEIPT_RETAINED_NOT_RETRIED"]
    }

    private func lifecycleMutate(id: Any, args: [String: Any]) {
        guard !readOnly, !controlInFlight, !lifecycleBusy, !lifecycleInFlight, lifecycleError == nil, let store = lifecycleStore, let journal = lifecycleJournal else {
            reply(id: id, payload: ["error": "LIFECYCLE_DISABLED_BUSY_OR_UNAVAILABLE", "providerWriteAttempted": false], failed: true); return
        }
        guard let homeId = args["homeId"] as? String, let operationId = args["operationId"] as? String,
            UUID(uuidString: operationId) != nil, let action = args["action"] as? String,
            let home = manager.homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }) else {
            reply(id: id, payload: ["error": "LIFECYCLE_ARGUMENTS_OR_HOME_INVALID", "providerWriteAttempted": false], failed: true); return
        }
        let request: [String: Any] = ["tool": "homekit_lifecycle_mutate", "arguments": args]
        do {
            if var replay = try journal.begin(operationId: operationId, request: request) {
                replay["replayed"] = true; reply(id: id, payload: replay, failed: replay["error"] is String); return
            }
        } catch { reply(id: id, payload: ["error": String(describing: error), "providerWriteAttempted": false], failed: true); return }
        lifecycleBusy = true
        var replied = false, attempted = false
        var resourceId = args["resourceId"] as? String
        let kind = args["kind"] as? String ?? (action == "createScene" ? "scene" : "automation")
        var creationOperation = operationId
        var timeout: DispatchWorkItem?
        func finish(_ result: [String: Any]) {
            guard !replied else { return }; replied = true; timeout?.cancel(); self.lifecycleBusy = false; self.lifecycleObservation = nil
            var payload = result; payload["operationId"] = operationId; payload["providerWriteAttempted"] = attempted
            payload["physicalCompletionVerified"] = false; payload["valueSource"] = "provider-object-after-callback"
            if let resourceId = resourceId { payload["resourceId"] = resourceId; payload["kind"] = kind }
            do { try journal.finish(operationId: operationId, request: request, result: payload) }
            catch { payload["error"] = "LIFECYCLE_RESULT_PERSISTENCE_FAILED_RECONCILE_REQUIRED"; payload["journalError"] = String(describing: error) }
            self.reply(id: id, payload: payload, failed: payload["error"] is String)
        }
        do {
            let common: Set<String> = ["homeId", "operationId", "action"]
            var scene: HMActionSet?, trigger: HMEventTrigger?, newTrigger: HMEventTrigger?
            var newEvents: [HMEvent]?, newAction: HMAction?, removedAction: HMAction?, linkedScene: HMActionSet?
            var updatedAction: HMCharacteristicWriteAction<NSCopying>?
            var actionTarget: [String: Any]?, actionValue: Any?, actionBaseline = Set<String>()
            var copiedActionValue: NSCopying?, confirmedActionId: String?
            var desiredName: String?
            let extra: Set<String>
            switch action {
            case "createScene": extra = ["name"]
            case "createAutomation": extra = ["name", "events"]
            case "rename": extra = ["kind", "resourceId", "expectedRevision", "name"]
            case "addAction": extra = ["kind", "resourceId", "expectedRevision", "target", "value"]
            case "updateAction": extra = ["kind", "resourceId", "expectedRevision", "actionId", "value"]
            case "removeAction": extra = ["kind", "resourceId", "expectedRevision", "actionId"]
            case "updateEvents": extra = ["kind", "resourceId", "expectedRevision", "events"]
            case "linkScene", "unlinkScene": extra = ["kind", "resourceId", "expectedRevision", "sceneId"]
            case "delete": extra = ["kind", "resourceId", "expectedRevision"]
            default: throw ControlFailure.invalid("LIFECYCLE_ACTION_UNSUPPORTED")
            }
            guard Set(args.keys) == common.union(extra) else { throw ControlFailure.invalid("LIFECYCLE_KEYS_INVALID") }
            if extra.contains("name") {
                guard let name = args["name"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                    name.utf8.count <= 120 else { throw ControlFailure.invalid("RESOURCE_NAME_INVALID") }
                desiredName = action.hasPrefix("create") ? "DecompozR Test \(operationId) \(name)" : name
            }
            if action == "createAutomation" {
                newEvents = try lifecycleEvents(args["events"], home: home)
                newTrigger = HMEventTrigger(name: desiredName!, events: newEvents!, predicate: nil)
                guard !newTrigger!.isEnabled, newTrigger!.actionSets.isEmpty else { throw ControlFailure.invalid("NEW_TRIGGER_NOT_DISABLED_EMPTY") }
                resourceId = newTrigger!.uniqueIdentifier.uuidString
            } else if action != "createScene" {
                guard let currentId = resourceId, ["scene", "automation"].contains(kind) else { throw ControlFailure.invalid("RESOURCE_ID_KIND_REQUIRED") }
                creationOperation = try store.requireOwned(homeId: homeId, id: currentId, kind: kind)
                if action == "rename", let name = args["name"] as? String { desiredName = "DecompozR Test \(creationOperation) \(name)" }
                let snapshot = try lifecycleDefinition(home: home, kind: kind, resourceId: currentId)
                try LifecycleStore.requireRevision(args["expectedRevision"] as? String, snapshot: snapshot)
                if kind == "scene" {
                    scene = home.actionSets.first(where: { $0.uniqueIdentifier.uuidString == currentId })
                    guard let scene = scene else { throw ControlFailure.invalid("USER_SCENE_NOT_FOUND") }
                    try requireEditableScene(scene, home: home)
                    if action == "delete", home.triggers.contains(where: { $0.actionSets.contains(where: { $0.uniqueIdentifier == scene.uniqueIdentifier }) }) { throw ControlFailure.invalid("SCENE_STILL_REFERENCED") }
                } else {
                    trigger = home.triggers.first(where: { $0.uniqueIdentifier.uuidString == currentId }) as? HMEventTrigger
                    guard let trigger = trigger else { throw ControlFailure.invalid("EVENT_TRIGGER_NOT_FOUND") }
                    try requireEditableTrigger(trigger, home: home)
                }
                if action == "addAction" {
                    guard let scene = scene, scene.actions.count < 256, let target = args["target"] as? [String: Any] else { throw ControlFailure.invalid("ACTION_SCENE_TARGET_REQUIRED") }
                    let c = try lifecycleCharacteristic(target, home: home)
                    guard c.properties.contains(HMCharacteristicPropertyWritable),
                        !scene.actions.contains(where: { ($0 as? HMCharacteristicWriteAction<NSCopying>)?.characteristic.uniqueIdentifier == c.uniqueIdentifier }) else { throw ControlFailure.invalid("ACTION_NOT_WRITABLE_OR_DUPLICATE_TARGET") }
                    let value = try ControlValue.decode(args["value"] ?? NSNull(), format: c.metadata?.format ?? "", minimum: c.metadata?.minimumValue,
                        maximum: c.metadata?.maximumValue, step: c.metadata?.stepValue, validValues: c.metadata?.validValues, maxLength: c.metadata?.maxLength)
                    guard let copied = value as? NSCopying else { throw ControlFailure.invalid("ACTION_VALUE_NOT_COPYABLE") }
                    newAction = HMCharacteristicWriteAction<NSCopying>(characteristic: c, targetValue: copied)
                    actionTarget = reference(c, home: home); actionValue = scalar(value)
                    actionBaseline = Set(scene.actions.map { $0.uniqueIdentifier.uuidString })
                } else if action == "updateAction" {
                    guard let scene = scene, let actionId = args["actionId"] as? String,
                        let entry = scene.actions.first(where: { $0.uniqueIdentifier.uuidString == actionId }) as? HMCharacteristicWriteAction<NSCopying> else { throw ControlFailure.invalid("ACTION_NOT_IN_OWNED_SCENE") }
                    let c = entry.characteristic
                    guard c.properties.contains(HMCharacteristicPropertyWritable) else { throw ControlFailure.invalid("ACTION_NOT_WRITABLE") }
                    let value = try ControlValue.decode(args["value"] ?? NSNull(), format: c.metadata?.format ?? "", minimum: c.metadata?.minimumValue,
                        maximum: c.metadata?.maximumValue, step: c.metadata?.stepValue, validValues: c.metadata?.validValues, maxLength: c.metadata?.maxLength)
                    guard let copied = value as? NSCopying else { throw ControlFailure.invalid("ACTION_VALUE_NOT_COPYABLE") }
                    updatedAction = entry; copiedActionValue = copied; confirmedActionId = actionId
                    actionTarget = reference(c, home: home); actionValue = scalar(value)
                } else if action == "removeAction" {
                    guard let scene = scene, let actionId = args["actionId"] as? String,
                        let entry = scene.actions.first(where: { $0.uniqueIdentifier.uuidString == actionId }) else { throw ControlFailure.invalid("ACTION_NOT_FOUND") }
                    removedAction = entry
                } else if action == "updateEvents" {
                    guard trigger != nil else { throw ControlFailure.invalid("EVENT_TRIGGER_REQUIRED") }
                    newEvents = try lifecycleEvents(args["events"], home: home, existing: trigger!.events.isEmpty ? nil : trigger!.events)
                } else if action == "linkScene" || action == "unlinkScene" {
                    guard let trigger = trigger, let sceneId = args["sceneId"] as? String,
                        let entry = home.actionSets.first(where: { $0.uniqueIdentifier.uuidString == sceneId }) else { throw ControlFailure.invalid("LINK_SCENE_NOT_FOUND") }
                    _ = try store.requireOwned(homeId: homeId, id: sceneId, kind: "scene")
                    try requireEditableScene(entry, home: home)
                    let associated = trigger.actionSets.contains(where: { $0.uniqueIdentifier == entry.uniqueIdentifier })
                    guard associated == (action == "unlinkScene") else { throw ControlFailure.invalid("LINK_STATE_CONFLICT") }
                    linkedScene = entry
                } else if !["rename", "delete"].contains(action) { throw ControlFailure.invalid("ACTION_RESOURCE_KIND_MISMATCH") }
            }
            if let currentId = resourceId {
                try store.record(homeId: homeId, id: currentId, kind: kind, state: "uncertain", operationId: creationOperation)
            }
            if action == "createAutomation" {
                lifecycleObservation = ["operationId": operationId, "submittedResourceId": resourceId ?? NSNull(),
                    "homeId": homeId, "baselineTriggerIds": home.triggers.map { $0.uniqueIdentifier.uuidString }]
                var record = lifecycleObservation!; record["phase"] = "before-add-trigger"
                record["definition"] = triggerDetail(newTrigger!, home: home)
                try store.observe(record)
            }
            attempted = true; lifecycleInFlight = true
            timeout = DispatchWorkItem { finish(["error": "LIFECYCLE_OUTCOME_UNKNOWN", "outcome": "reconcile-no-retry"]) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: timeout!)
            func completed(_ error: Error?) {
                DispatchQueue.main.async {
                    self.lifecycleInFlight = false
                    guard !replied else { return }
                    if let error = error { finish(["error": String(describing: error), "outcome": "provider-error-reconcile-no-retry"]); return }
                    self.lifecycleReadback = LifecycleReadback { homes in
                      if let providerManager = self.lifecycleReadback?.manager {
                          self.manager = providerManager; providerManager.delegate = self
                          for observedHome in homes { observedHome.delegate = self }
                      }
                      self.lifecycleReadback = nil
                      guard !replied else { return }
                      do {
                        guard let observedHome = homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }) else { throw ControlFailure.invalid("READBACK_HOME_NOT_FOUND") }
                        if action == "createAutomation", let context = self.lifecycleObservation {
                            let baseline = Set(context["baselineTriggerIds"] as? [String] ?? [])
                            var record = context; record["phase"] = "independent-manager-readback"
                            record["newDefinitions"] = observedHome.triggers.filter { !baseline.contains($0.uniqueIdentifier.uuidString) }.map { self.triggerDetail($0, home: observedHome) }
                            try store.observe(record)
                            let proof = try store.creationProof(homeId: homeId, operationId: operationId)
                            guard let canonicalId = proof["id"] as? String else { throw ControlFailure.invalid("PERSISTED_CREATION_ID_MISSING") }
                            resourceId = canonicalId
                            try store.record(homeId: homeId, id: canonicalId, kind: kind, state: "uncertain", operationId: creationOperation, creationVerified: true)
                        }
                        guard let currentId = resourceId else { throw ControlFailure.invalid("CREATED_ID_MISSING") }
                        if action == "delete" {
                            let absent = kind == "scene" ? !observedHome.actionSets.contains(where: { $0.uniqueIdentifier.uuidString == currentId }) : !observedHome.triggers.contains(where: { $0.uniqueIdentifier.uuidString == currentId })
                            guard absent else { throw ControlFailure.invalid("DELETE_READBACK_MISMATCH") }
                            try store.record(homeId: homeId, id: currentId, kind: kind, state: "deleted", operationId: creationOperation)
                            finish(["writeAcknowledged": true, "definitionVerified": true, "absentVerified": true]); return
                        }
                        let observed = try self.lifecycleDefinition(home: observedHome, kind: kind, resourceId: currentId)
                        if let desiredName = desiredName, observed["name"] as? String != desiredName { throw ControlFailure.invalid("NAME_READBACK_MISMATCH") }
                        if kind == "automation", observed["enabled"] as? Bool != false { throw ControlFailure.invalid("DISABLED_READBACK_MISMATCH") }
                        let observedScene = observedHome.actionSets.first(where: { $0.uniqueIdentifier.uuidString == currentId })
                        let observedTrigger = observedHome.triggers.first(where: { $0.uniqueIdentifier.uuidString == currentId }) as? HMEventTrigger
                        if newAction != nil, let target = actionTarget, let value = actionValue {
                            guard let actions = observed["actions"] as? [[String: Any]], observed["actionsTruncated"] as? Bool == false else { throw ControlFailure.invalid("ACTION_READBACK_INCOMPLETE") }
                            confirmedActionId = try LifecycleStore.addedAction(actions, baseline: actionBaseline, target: target, value: value)
                        }
                        if updatedAction != nil, let target = actionTarget, let value = actionValue,
                            let actionId = confirmedActionId {
                            guard let entries = observed["actions"] as? [[String: Any]],
                                let entry = entries.first(where: { $0["id"] as? String == actionId }),
                                try LifecycleStore.actionMatches(entry, target: target, value: value) else { throw ControlFailure.invalid("ACTION_UPDATE_READBACK_MISMATCH") }
                        }
                        if let entry = removedAction, observedScene?.actions.contains(where: { $0.uniqueIdentifier == entry.uniqueIdentifier }) != false { throw ControlFailure.invalid("ACTION_REMOVE_READBACK_MISMATCH") }
                        if let entry = linkedScene, let trigger = observedTrigger,
                            trigger.actionSets.contains(where: { $0.uniqueIdentifier == entry.uniqueIdentifier }) != (action == "linkScene") { throw ControlFailure.invalid("LINK_READBACK_MISMATCH") }
                        if let expected = newEvents {
                            guard let actual = observedTrigger?.events else { throw ControlFailure.invalid("READBACK_TRIGGER_NOT_FOUND") }
                            func normalized(_ events: [HMEvent]) throws -> Data {
                                let entries = events.map { event -> [String: Any] in
                                    var detail = self.eventDetail(event, home: observedHome); detail.removeValue(forKey: "id"); detail.removeValue(forKey: "providerType"); return detail
                                }
                                return try JSONSerialization.data(withJSONObject: entries, options: [.sortedKeys])
                            }
                            guard try normalized(actual) == normalized(expected) else { throw ControlFailure.invalid("EVENT_READBACK_MISMATCH") }
                        }
                        try store.record(homeId: homeId, id: currentId, kind: kind, state: "owned", operationId: creationOperation)
                        var result: [String: Any] = ["writeAcknowledged": true, "definitionVerified": true, "definition": observed, "revision": try LifecycleStore.revision(observed)]
                        if let actionId = confirmedActionId { result["actionId"] = actionId }
                        finish(result)
                      } catch { finish(["error": String(describing: error), "writeAcknowledged": true, "outcome": "reconcile-no-retry"]) }
                    }
                }
            }
            if action == "createScene" {
                home.addActionSet(withName: desiredName!) { created, error in
                    DispatchQueue.main.async {
                        if let created = created {
                            resourceId = created.uniqueIdentifier.uuidString
                            do { try store.record(homeId: homeId, id: resourceId!, kind: "scene", state: "uncertain", operationId: creationOperation) }
                            catch { finish(["error": "CREATION_OWNERSHIP_PERSISTENCE_FAILED", "outcome": "reconcile-no-retry"]); return }
                        }
                        completed(error)
                    }
                }
            } else if let newTrigger = newTrigger {
                home.addTrigger(newTrigger) { error in
                    DispatchQueue.main.async {
                        do {
                            var record = self.lifecycleObservation ?? [:]; record["phase"] = "add-trigger-completion"
                            record["callbackError"] = error.map { String(describing: $0) } ?? NSNull()
                            record["definition"] = self.triggerDetail(newTrigger, home: home)
                            try store.observe(record)
                            // Read the submitted object's provider-assigned identity AFTER completion.
                            resourceId = newTrigger.uniqueIdentifier.uuidString
                            try store.record(homeId: homeId, id: resourceId!, kind: kind, state: "uncertain", operationId: creationOperation)
                        } catch { self.lifecycleInFlight = false; finish(["error": String(describing: error), "outcome": "reconcile-no-retry"]); return }
                        completed(error)
                    }
                }
            }
            else if action == "rename", let scene = scene { scene.updateName(desiredName!, completionHandler: completed) }
            else if action == "rename", let trigger = trigger { trigger.updateName(desiredName!, completionHandler: completed) }
            else if let entry = newAction { scene!.addAction(entry, completionHandler: completed) }
            else if let entry = updatedAction, let value = copiedActionValue { entry.updateTargetValue(value, completionHandler: completed) }
            else if let entry = removedAction { scene!.removeAction(entry, completionHandler: completed) }
            else if action == "updateEvents" { trigger!.updateEvents(newEvents!, completionHandler: completed) }
            else if action == "linkScene" { trigger!.addActionSet(linkedScene!, completionHandler: completed) }
            else if action == "unlinkScene" { trigger!.removeActionSet(linkedScene!, completionHandler: completed) }
            else if let scene = scene { home.removeActionSet(scene, completionHandler: completed) }
            else if let trigger = trigger { home.removeTrigger(trigger, completionHandler: completed) }
        } catch { finish(["error": String(describing: error), "outcome": "validation-or-persistence-failure"]) }
    }

    private func productionControlOutcome(_ args: [String: Any]) throws -> [String: Any] {
        guard productionControls, let journal = controlJournal, let id = args["operationId"] as? String,
              UUID(uuidString: id) != nil, let home = args["homeId"] as? String else { throw ControlFailure.invalid("CONTROL_OUTCOME_ARGUMENTS_OR_DISABLED") }
        var target = args; target.removeValue(forKey: "action")
        let tool = args["action"] as? String == "write" ? "homekit_write" : args["action"] as? String == "executeScene" ? "homekit_execute_scene" : args["action"] as? String == "setAutomationEnabled" ? "homekit_set_automation_enabled" : "invalid"
        guard tool != "invalid" else { throw ControlFailure.invalid("CONTROL_ACTION_UNSUPPORTED") }
        let result = try journal.outcome(operationId: id, request: ["tool": tool, "arguments": target])
        return ["operationId": id, "homeId": home, "found": result != nil, "result": result ?? NSNull(), "providerWriteAttempted": false]
    }

    private func productionControlPreview(_ args: [String: Any]) throws -> [String: Any] {
        guard productionControls, controlEnabled, let store = lifecycleStore,
              let homeId = args["homeId"] as? String, UUID(uuidString: homeId) != nil,
              let operationId = args["operationId"] as? String, UUID(uuidString: operationId) != nil,
              let home = manager.homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }),
              let action = args["action"] as? String else { throw ControlFailure.invalid("PRODUCTION_CONTROL_UNAVAILABLE_OR_HOME") }
        var definition: [String: Any]
        func checkedScene(_ scene: HMActionSet, allowedReference: String? = nil) throws -> [String: Any] {
            _ = try store.requireOwned(homeId: homeId, id: scene.uniqueIdentifier.uuidString, kind: "scene")
            var snapshot = sceneDetail(scene, home: home)
            guard scene.actionSetType == HMActionSetTypeUserDefined else { throw ControlFailure.invalid("SCENE_TYPE_UNSUPPORTED") }
            snapshot["actionSetType"] = "HMActionSetTypeUserDefined"
            if let reference = allowedReference {
                let references = snapshot["referencedByTriggerIds"] as? [String] ?? []
                guard references.allSatisfy({ $0 == reference }) else { throw ControlFailure.invalid("SCENE_FOREIGN_REFERENCE") }
                snapshot["referencedByTriggerIds"] = [String]()
            }
            try ProductionControlPolicy.scene(snapshot, homeId: homeId)
            for entry in scene.actions {
                guard let write = entry as? HMCharacteristicWriteAction<NSCopying>,
                      write.characteristic.properties.contains(HMCharacteristicPropertyWritable),
                      !["array", "dict"].contains(write.characteristic.metadata?.format ?? "") else { throw ControlFailure.invalid("SCENE_NOT_WRITABLE") }
                let c = write.characteristic
                _ = try ControlValue.decode(scalar(write.targetValue), format: c.metadata?.format ?? "", minimum: c.metadata?.minimumValue,
                    maximum: c.metadata?.maximumValue, step: c.metadata?.stepValue, validValues: c.metadata?.validValues, maxLength: c.metadata?.maxLength)
            }
            return sceneDetail(scene, home: home)
        }
        if action == "write" {
            guard Set(args.keys) == ["action", "homeId", "operationId", "accessoryId", "serviceId", "characteristicId", "value"] else { throw ControlFailure.invalid("CONTROL_ARGUMENTS_INVALID") }
            let target = ["accessoryId": args["accessoryId"]!, "serviceId": args["serviceId"]!, "characteristicId": args["characteristicId"]!]
            let c = try lifecycleCharacteristic(target, home: home)
            guard let accessory = c.service?.accessory, accessory.isReachable, c.properties.contains(HMCharacteristicPropertyWritable),
                  let value = args["value"], !["array", "dict"].contains(c.metadata?.format ?? "") else { throw ControlFailure.invalid("CONTROL_TARGET_NOT_WRITABLE_OR_FORMAT_DEFERRED") }
            _ = try ControlValue.decode(value, format: c.metadata?.format ?? "", minimum: c.metadata?.minimumValue,
                maximum: c.metadata?.maximumValue, step: c.metadata?.stepValue, validValues: c.metadata?.validValues, maxLength: c.metadata?.maxLength)
            definition = ["homeId": homeId, "accessoryId": args["accessoryId"]!, "serviceId": args["serviceId"]!, "characteristicId": args["characteristicId"]!,
                "type": c.characteristicType, "properties": c.properties.sorted(), "format": c.metadata?.format ?? "",
                "minimum": scalar(c.metadata?.minimumValue), "maximum": scalar(c.metadata?.maximumValue),
                "step": scalar(c.metadata?.stepValue), "maxLength": scalar(c.metadata?.maxLength), "validValues": c.metadata?.validValues ?? []]
        } else if action == "executeScene" {
            guard Set(args.keys) == ["action", "homeId", "operationId", "sceneId"], let id = args["sceneId"] as? String,
                  let scene = home.actionSets.first(where: { $0.uniqueIdentifier.uuidString == id }) else { throw ControlFailure.invalid("CONTROL_SCENE_UNRESOLVED") }
            definition = try checkedScene(scene)
        } else if action == "setAutomationEnabled" {
            guard Set(args.keys) == ["action", "homeId", "operationId", "automationId", "enabled"],
                  let enabled = args["enabled"] as? NSNumber, CFGetTypeID(enabled) == CFBooleanGetTypeID(),
                  let id = args["automationId"] as? String,
                  let trigger = home.triggers.first(where: { $0.uniqueIdentifier.uuidString == id }) as? HMEventTrigger,
                  trigger.predicate == nil, trigger.endEvents.isEmpty, trigger.recurrences == nil,
                  (1...16).contains(trigger.events.count), trigger.events.allSatisfy({ $0 is HMCalendarEvent || $0 is HMCharacteristicEvent<NSCopying> }),
                  trigger.actionSets.count <= 16 else { throw ControlFailure.invalid("CONTROL_AUTOMATION_UNSUPPORTED") }
            _ = try store.requireOwned(homeId: homeId, id: id, kind: "automation")
            definition = triggerDetail(trigger, home: home)
            definition["scenes"] = try trigger.actionSets.map { try checkedScene($0, allowedReference: id) }
        } else { throw ControlFailure.invalid("CONTROL_ACTION_UNSUPPORTED") }
        return ["homeId": homeId, "operationId": operationId, "definition": definition,
            "revision": try LifecycleStore.revision(definition), "physicalCompletionVerified": false]
    }

    private func control(id: Any, name: String, args: [String: Any], productionIntent: [String: Any]? = nil) {
        guard controlEnabled, let journal = controlJournal else {
            reply(id: id, payload: ["error": "CONTROL_DISABLED_OR_JOURNAL_UNAVAILABLE"], failed: true); return
        }
        if productionControls {
            do {
                guard !controlInFlight, !lifecycleBusy, !lifecycleInFlight, let intent = productionIntent,
                      let expected = args["expectedRevision"] as? String else { throw ControlFailure.invalid("CONTROL_BUSY_OR_REVIEW_REQUIRED") }
                var command = intent; command.removeValue(forKey: "expectedRevision")
                let preview = try productionControlPreview(command)
                guard preview["revision"] as? String == expected else { throw ControlFailure.invalid("STALE_CONTROL_REVISION") }
            } catch {
                reply(id: id, payload: ["error": String(describing: error), "operationId": args["operationId"] ?? NSNull(),
                    "intent": productionIntent ?? args, "providerWriteAttempted": false, "physicalCompletionVerified": false], failed: true); return
            }
        }
        var keys: Set<String> = name == "homekit_write"
            ? ["homeId", "accessoryId", "serviceId", "characteristicId", "value", "operationId"]
            : name == "homekit_execute_scene" ? ["homeId", "sceneId", "operationId"]
            : ["homeId", "automationId", "enabled", "operationId"]
        if productionControls { keys.insert("expectedRevision") }
        guard Set(args.keys) == keys, let operationId = args["operationId"] as? String,
              let homeId = args["homeId"] as? String,
              let home = manager.homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }) else {
            reply(id: id, payload: ["error": "INVALID_ARGUMENTS_OR_HOME"], failed: true); return
        }
        var characteristic: HMCharacteristic?
        var desiredValue: Any?
        var scene: HMActionSet?
        var trigger: HMTrigger?
        do {
            if name == "homekit_write" {
                guard let accessoryId = args["accessoryId"] as? String, let serviceId = args["serviceId"] as? String,
                      let characteristicId = args["characteristicId"] as? String,
                      let accessory = home.accessories.first(where: { $0.uniqueIdentifier.uuidString == accessoryId }),
                      accessory.isReachable,
                      let service = accessory.services.first(where: { $0.uniqueIdentifier.uuidString == serviceId }),
                      let c = service.characteristics.first(where: { $0.uniqueIdentifier.uuidString == characteristicId }),
                      c.properties.contains(HMCharacteristicPropertyWritable), let value = args["value"] else {
                    throw ControlFailure.invalid("TARGET_UNRESOLVED_UNREACHABLE_OR_NOT_WRITABLE")
                }
                desiredValue = try ControlValue.decode(value, format: c.metadata?.format ?? "",
                    minimum: c.metadata?.minimumValue, maximum: c.metadata?.maximumValue,
                    step: c.metadata?.stepValue, validValues: c.metadata?.validValues, maxLength: c.metadata?.maxLength)
                characteristic = c
            } else if name == "homekit_execute_scene" {
                guard let sceneId = args["sceneId"] as? String,
                      let actionSet = home.actionSets.first(where: { $0.uniqueIdentifier.uuidString == sceneId }) else {
                    throw ControlFailure.invalid("SCENE_UNRESOLVED")
                }
                scene = actionSet
            } else {
                guard let automationId = args["automationId"] as? String,
                      let enabled = args["enabled"] as? NSNumber, CFGetTypeID(enabled) == CFBooleanGetTypeID(),
                      let automation = home.triggers.first(where: { $0.uniqueIdentifier.uuidString == automationId }) else {
                    throw ControlFailure.invalid("AUTOMATION_UNRESOLVED_OR_BOOLEAN_REQUIRED")
                }
                trigger = automation
            }
        } catch {
            reply(id: id, payload: ["error": String(describing: error)], failed: true); return
        }
        let request: [String: Any] = ["tool": name, "arguments": args]
        do {
            if var replay = try journal.begin(operationId: operationId, request: request) {
                replay["replayed"] = true
                reply(id: id, payload: replay, failed: replay["error"] is String); return
            }
        } catch {
            reply(id: id, payload: ["error": String(describing: error), "providerWriteAttempted": false], failed: true); return
        }
        if productionControls { controlInFlight = true }
        var replied = false
        var acknowledged = false
        var timeout: DispatchWorkItem?
        func finish(_ result: [String: Any]) {
            if replied { return }; replied = true; timeout?.cancel()
            var payload = result
            payload["operationId"] = operationId
            payload["providerWriteAttempted"] = true
            if let intent = productionIntent { payload["intent"] = intent }
            payload["physicalCompletionVerified"] = false
            do { try journal.finish(operationId: operationId, request: request, result: payload) }
            catch { payload["journalError"] = String(describing: error); payload["error"] = "RESULT_PERSISTENCE_FAILED_RECONCILE_REQUIRED" }
            self.reply(id: id, payload: payload, failed: payload["error"] is String)
        }
        timeout = DispatchWorkItem {
            finish(["error": acknowledged ? "READBACK_TIMEOUT" : "WRITE_OUTCOME_UNKNOWN", "writeAcknowledged": acknowledged])
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: timeout!)
        let completion: (Error?) -> Void = { error in
            DispatchQueue.main.async {
                if self.productionControls { self.controlInFlight = false }
                if replied { return }
                if let error = error {
                    finish(["error": String(describing: error), "writeAcknowledged": false,
                        "outcome": "provider-error-reconcile-before-retry"]); return
                }
                acknowledged = true
                if let c = characteristic, let desired = desiredValue {
                    if !c.properties.contains(HMCharacteristicPropertyReadable) {
                        finish(["writeAcknowledged": true, "valueVerified": false, "readbackAvailable": false]); return
                    }
                    timeout?.cancel()
                    timeout = DispatchWorkItem { finish(["error": "READBACK_TIMEOUT", "writeAcknowledged": true]) }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: timeout!)
                    c.readValue { readError in
                        DispatchQueue.main.async {
                            if replied { return }
                            let verified = readError == nil && c.value.map { (desired as? NSObject)?.isEqual($0) == true } == true
                            var result: [String: Any] = ["writeAcknowledged": true, "valueVerified": verified,
                                "desired": self.scalar(desired), "observed": self.scalar(c.value), "valueSource": "fresh-read"]
                            if let readError = readError { result["error"] = String(describing: readError); result["valueSource"] = "read-failed" }
                            else if !verified { result["error"] = "READBACK_MISMATCH" }
                            finish(result)
                        }
                    }
                } else if let trigger = trigger {
                    let expected = (args["enabled"] as! NSNumber).boolValue
                    var result: [String: Any] = ["writeAcknowledged": true, "enabled": trigger.isEnabled,
                        "enabledVerified": trigger.isEnabled == expected, "valueSource": "provider-object-after-callback"]
                    if trigger.isEnabled != expected { result["error"] = "AUTOMATION_STATE_MISMATCH" }
                    finish(result)
                } else {
                    finish(["writeAcknowledged": true, "sceneExecutionAcknowledged": true,
                        "individualActionsVerified": false])
                }
            }
        }
        if let c = characteristic, let desired = desiredValue { c.writeValue(desired, completionHandler: completion) }
        else if let scene = scene { home.executeActionSet(scene, completionHandler: completion) }
        else if let trigger = trigger { trigger.enable((args["enabled"] as! NSNumber).boolValue, completionHandler: completion) }
    }

    private func reply(id: Any, payload: [String: Any], failed: Bool) {
        let data = (try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])) ?? Data()
        emit(["jsonrpc": "2.0", "id": id, "result": ["isError": failed,
            "content": [["type": "text", "text": String(data: data, encoding: .utf8) ?? "{}"]]]])
    }
    var homeAuthorized: Bool { manager.authorizationStatus.contains(.authorized) }
    var controlEnabled: Bool { !readOnly && (!lifecycleRequested || productionControls && lifecycleError == nil) && controlJournal != nil }
}

final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        Probe.shared.start()
        DesktopPresentation.schedule()
        return true
    }
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Default", sessionRole: connectingSceneSession.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func sceneDidBecomeActive(_ scene: UIScene) { DesktopPresentation.schedule() }
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard HelperPresentation.showsWindow(CommandLine.arguments), let windowScene = scene as? UIWindowScene else { DesktopPresentation.schedule(); return }
        let controller = UIViewController()
        controller.view.backgroundColor = .systemBackground
        let label = UILabel(frame: CGRect(x: 30, y: 50, width: 550, height: 120))
        label.numberOfLines = 0
        label.text = Probe.shared.controlEnabled
            ? "HomeKit control experiment\nDevice controls, scenes and automations are available.\nNotification delivery remains disabled."
            : "HomeKit read-only experiment\nNative MCP runs over stdin/stdout.\nNo physical controls or notification delivery are enabled."
        controller.view.addSubview(label)
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = controller
        window?.makeKeyAndVisible()
    }
}
UIApplicationMain(CommandLine.argc, CommandLine.unsafeArgv, nil, NSStringFromClass(AppDelegate.self))
