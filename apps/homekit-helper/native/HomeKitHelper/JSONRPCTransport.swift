import Foundation
import CoreFoundation
import Darwin

/// Bounded framing is independent of HomeKit and preserves partial input.
struct RPCFrameDecoder {
    static let maximumBytes = 65536
    private var pending = Data()
    mutating func append(_ bytes: Data) throws -> [Data] {
        var frames: [Data] = []
        for byte in bytes {
            if byte == 10 { if !pending.isEmpty { frames.append(pending) }; pending.removeAll(keepingCapacity: true) }
            else { guard pending.count < Self.maximumBytes else { throw ControlFailure.invalid("RPC_INPUT_LIMIT") }; pending.append(byte) }
        }
        return frames
    }
    var partial: Bool { !pending.isEmpty }
}
final class JSONRPCTransport {
    private let outputLock = NSLock()
    func emit(_ object: [String: Any]) {
        guard let bytes = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]), bytes.count <= 8 * 1024 * 1024 else { return }
        outputLock.lock(); defer { outputLock.unlock() }
        FileHandle.standardOutput.write(bytes); FileHandle.standardOutput.write(Data([10]))
    }
    func reply(id: Any, payload: [String: Any], failed: Bool) {
        guard let bytes = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]), let text = String(data: bytes, encoding: .utf8) else { return }
        emit(["jsonrpc": "2.0", "id": id, "result": ["isError": failed, "content": [["type": "text", "text": text]]]])
    }
    static func request(_ bytes: Data) throws -> [String: Any] {
        guard let object = try JSONSerialization.jsonObject(with: bytes) as? [String: Any], object["jsonrpc"] as? String == "2.0",
              let method = object["method"] as? String, method.utf8.count <= 128 else { throw ControlFailure.invalid("RPC_REQUEST_INVALID") }
        if let id = object["id"] {
            if let number = id as? NSNumber { guard CFGetTypeID(number) != CFBooleanGetTypeID(), number.doubleValue.isFinite, number.doubleValue.rounded() == number.doubleValue, abs(number.doubleValue) <= 9007199254740991 else { throw ControlFailure.invalid("RPC_ID_INVALID") } }
            else if let string = id as? String { guard string.utf8.count <= 256 else { throw ControlFailure.invalid("RPC_ID_INVALID") } }
            else { throw ControlFailure.invalid("RPC_ID_INVALID") }
        }
        guard object["params"] == nil || object["params"] is [String: Any] else { throw ControlFailure.invalid("RPC_PARAMS_INVALID") }
        return object
    }
    func start(_ handler: @escaping ([String: Any]) -> Void) {
        DispatchQueue.global(qos: .utility).async {
            var decoder = RPCFrameDecoder()
            do {
                var buffer = [UInt8](repeating: 0, count: 4096)
                while true {
                    let count = Darwin.read(STDIN_FILENO, &buffer, buffer.count)
                    if count == 0 { break }
                    if count < 0 { if errno == EINTR { continue }; throw ControlFailure.invalid("RPC_INPUT_FAILED") }
                    for frame in try decoder.append(Data(buffer.prefix(count))) {
                        do { let request = try Self.request(frame); DispatchQueue.main.async { handler(request) } }
                        catch { self.emit(["jsonrpc": "2.0", "id": NSNull(), "error": ["code": -32600, "message": "Invalid request"]]) }
                    }
                }
                exit(decoder.partial ? 65 : 0)
            } catch { self.emit(["jsonrpc": "2.0", "id": NSNull(), "error": ["code": -32600, "message": "Input limit or transport failure"]]); exit(65) }
        }
    }
}
