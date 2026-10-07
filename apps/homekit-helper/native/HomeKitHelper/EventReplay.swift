import Foundation
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
