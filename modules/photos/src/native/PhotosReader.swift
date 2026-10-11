import Foundation
import Security
import Darwin

struct ReaderFailure: Error { let code: String }
func reject(_ code: String) throws -> Never { throw ReaderFailure(code: code) }
let commands: Set<String> = ["access", "health", "persons", "albums", "query", "detail", "preview", "compare", "cleanup", "inspect"]
#if PHOTOS_READER_TEST_TIMEOUT
let operationTimeout: TimeInterval = 1
#else
let operationTimeout: TimeInterval = 55
#endif

final class Capture: @unchecked Sendable {
    private let lock = NSLock()
    private var data = Data()
    private var oversized = false
    func read(_ handle: FileHandle, limit: Int, process: Process) {
        while let chunk = try? handle.read(upToCount: 65536), !chunk.isEmpty {
            lock.lock()
            if data.count + chunk.count > limit {
                oversized = true
                lock.unlock()
                if process.isRunning { process.terminate() }
                break
            }
            data.append(chunk)
            lock.unlock()
        }
    }
    func result() throws -> Data {
        lock.lock(); defer { lock.unlock() }
        if oversized { try reject("provider_output_limit") }
        return data
    }
}
final class RequestWriter: @unchecked Sendable {
    private let lock = NSLock()
    private var failed = false
    func write(_ data: Data, to handle: FileHandle) {
        defer { try? handle.close() }
        do { try handle.write(contentsOf: data) }
        catch { lock.lock(); failed = true; lock.unlock() }
    }
    func check() throws { lock.lock(); defer { lock.unlock() }; if failed { try reject("provider_failed") } }
}

func reader(_ input: [String: Any]) throws -> [String: Any] {
    guard Set(input.keys).isSubset(of: ["command", "library", "input"]),
          let command = input["command"] as? String, commands.contains(command),
          let requested = input["library"] as? String else { try reject("unsupported_command") }
    // The permission-bearing app executes only its sealed resources. No external
    // interpreter, script, environment, command line or library is supplied by IPC.
    let bundle = Bundle.main.bundleURL
    var code: SecStaticCode?
    guard SecStaticCodeCreateWithPath(bundle as CFURL, [], &code) == errSecSuccess,
          let code = code,
          SecStaticCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSStrictValidate | kSecCSCheckNestedCode), nil) == errSecSuccess,
          let resources = Bundle.main.resourceURL else { try reject("reader_signature_invalid") }
    let configuration = try JSONSerialization.jsonObject(with: Data(contentsOf: resources.appendingPathComponent("reader-config.json"))) as? [String: Any]
    guard let selected = configuration?["library"] as? String,
          selected.hasPrefix("/"), requested == selected else { try reject("reader_library_mismatch") }
    let library = URL(fileURLWithPath: selected).resolvingSymlinksInPath()
    guard library.path == selected, library.pathExtension == "photoslibrary" else { try reject("invalid_library") }
    // Check access in this app, not in the generic host. This never requests or
    // changes a macOS permission and does not open the SQLite database for writing.
    let database = library.appendingPathComponent("database/Photos.sqlite").resolvingSymlinksInPath()
    guard database.path.hasPrefix(library.path + "/") else { try reject("invalid_library") }
    do {
        let file = try FileHandle(forReadingFrom: database)
        defer { try? file.close() }
        _ = try file.read(upToCount: 16)
    } catch { try reject("photos_permission_required") }
    if command == "access" { return ["ok": true, "result": ["readable": true]] }

    let python = resources.appendingPathComponent("python/bin/python3.12")
    let process = Process(), output = Pipe(), errors = Pipe(), source = Pipe()
    process.executableURL = python
    process.arguments = ["-I", "-S", "-B", resources.appendingPathComponent("reader-bootstrap.py").path]
    process.environment = ["HOME": NSHomeDirectory(), "PATH": "/usr/bin:/bin", "PYTHONDONTWRITEBYTECODE": "1"]
    process.currentDirectoryURL = resources
    process.standardInput = source; process.standardOutput = output; process.standardError = errors
    let completed = DispatchSemaphore(value: 0)
    process.terminationHandler = { _ in completed.signal() }
    let requestData = try JSONSerialization.data(withJSONObject: input)
    guard requestData.count <= 65536 else { try reject("request_too_large") }
    let deadline = DispatchTime.now() + operationTimeout
    try process.run()
    defer {
        if process.isRunning {
            process.terminate()
            if completed.wait(timeout: .now() + 1) == .timedOut { kill(process.processIdentifier, SIGKILL) }
        }
        try? source.fileHandleForWriting.close()
    }
    let out = Capture(), err = Capture(), writer = RequestWriter(), readers = DispatchGroup()
    readers.enter()
    DispatchQueue.global().async { out.read(output.fileHandleForReading, limit: 12 * 1024 * 1024, process: process); readers.leave() }
    readers.enter()
    DispatchQueue.global().async { err.read(errors.fileHandleForReading, limit: 128 * 1024, process: process); readers.leave() }
    readers.enter()
    DispatchQueue.global().async { writer.write(requestData, to: source.fileHandleForWriting); readers.leave() }
    if completed.wait(timeout: deadline) == .timedOut {
        process.terminate()
        if completed.wait(timeout: .now() + 1) == .timedOut { kill(process.processIdentifier, SIGKILL) }
        try reject("provider_timeout")
    }
    guard readers.wait(timeout: .now() + 1) == .success else { try reject("provider_timeout") }
    try writer.check()
    _ = try err.result()
    let data = try out.result()
    guard process.terminationStatus == 0 else { try reject("provider_failed") }
    guard let envelope = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          Set(envelope.keys).isSubset(of: ["ok", "result", "error"]),
          let okay = envelope["ok"] as? Bool else { try reject("invalid_provider_response") }
    if !okay {
        let error = envelope["error"] as? String ?? "invalid_provider_response"
        guard error.range(of: "^[a-z_]{1,80}$", options: .regularExpression) != nil else { try reject("invalid_provider_response") }
    }
    return envelope
}

@main struct PhotosReaderMain {
    static func main() {
        signal(SIGPIPE, SIG_IGN)
        do {
            let data = try FileHandle.standardInput.read(upToCount: 65537) ?? Data()
            guard data.count <= 65536,
                  let input = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { try reject("invalid_request") }
            let result = try reader(input)
            print(String(decoding: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), as: UTF8.self))
        } catch {
            let code = (error as? ReaderFailure)?.code ?? "reader_failed"
            print("{\"ok\":false,\"error\":\"\(code)\"}")
        }
        fflush(stdout)
    }
}
