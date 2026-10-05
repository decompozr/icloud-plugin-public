// Nonshipping research. Never included in the operation Helper build.
import Foundation
import Darwin

final class ReviewJournal {
    private let descriptor: Int32
    let operationId: String
    init(directory: String, operationId: String) throws {
        guard directory.hasPrefix("/"), UUID(uuidString: operationId) != nil else { try fail("invalid_request") }
        let attributes = try FileManager.default.attributesOfItem(atPath: directory)
        guard attributes[.type] as? FileAttributeType == .typeDirectory,
              (attributes[.posixPermissions] as? NSNumber)?.intValue == 0o700,
              (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid() else { try fail("private_review_directory_required") }
        let path = URL(fileURLWithPath: directory).appendingPathComponent(operationId + ".jsonl").path
        descriptor = open(path, O_WRONLY | O_CREAT | O_EXCL | O_APPEND | O_NOFOLLOW, 0o600)
        guard descriptor >= 0 else { try fail("existing_or_unavailable_review") }
        self.operationId = operationId
    }
    func record(_ status: String, values: [String: Any] = [:]) throws {
        var event = values
        event["operationId"] = operationId
        event["status"] = status
        event["timestamp"] = Date().timeIntervalSince1970
        event["processId"] = getpid()
        event["localReadbackVerified"] = false
        event["serverSyncVerified"] = false
        var data = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys])
        data.append(0x0A)
        try data.withUnsafeBytes { bytes in
            var offset = 0
            while offset < bytes.count {
                let count = Darwin.write(descriptor, bytes.baseAddress!.advanced(by: offset), bytes.count - offset)
                if count < 0 && errno == EINTR { continue }
                guard count > 0 else { try fail("review_record_failed") }
                offset += count
            }
        }
        guard fsync(descriptor) == 0 else { try fail("review_record_failed") }
    }
    deinit { close(descriptor) }
}
