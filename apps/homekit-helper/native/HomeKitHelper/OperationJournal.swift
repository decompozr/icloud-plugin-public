import Foundation
import Darwin
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
