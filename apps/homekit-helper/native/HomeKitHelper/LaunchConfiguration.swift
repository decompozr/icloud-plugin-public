import Foundation

/// Broker-selected modes are explicit; unconfigured launches cannot control Home.
struct LaunchConfiguration {
    enum Mode: String { case idle, enrollment, read, definitions, control }
    let mode: Mode
    let homeId: String?
    let ledgerDirectory: String?
    let eventJournal: String?
    let pidFile: String?
    var isReadOnly: Bool { mode == .idle || mode == .enrollment || mode == .read }
    static let idle = LaunchConfiguration(mode: .idle, homeId: nil, ledgerDirectory: nil, eventJournal: nil, pidFile: nil)
    private init(mode: Mode, homeId: String?, ledgerDirectory: String?, eventJournal: String?, pidFile: String?) {
        self.mode = mode; self.homeId = homeId; self.ledgerDirectory = ledgerDirectory; self.eventJournal = eventJournal; self.pidFile = pidFile
    }
    init(arguments: [String]) throws {
        func value(_ key: String) throws -> String? {
            guard let index = arguments.firstIndex(of: key) else { return nil }
            guard arguments.indices.contains(index + 1), !arguments[index + 1].hasPrefix("--"), arguments[index + 1].utf8.count <= 4096,
                  arguments.filter({ $0 == key }).count == 1 else { throw ControlFailure.invalid("LAUNCH_ARGUMENT_INVALID") }
            return arguments[index + 1]
        }
        let values: Set<String> = ["--mode", "--home-id", "--lifecycle-directory", "--event-journal", "--pid-file"]
        var index = 1
        while index < arguments.count {
            let argument = arguments[index]
            if values.contains(argument) { guard arguments.indices.contains(index + 1) else { throw ControlFailure.invalid("LAUNCH_ARGUMENT_INVALID") }; index += 2 }
            else if argument == "--show-window" || argument.hasPrefix("-psn_") { index += 1 }
            else if ["-ApplePersistenceIgnoreState", "-NSDocumentRevisionsDebugMode"].contains(argument) { index += 2 }
            else { throw ControlFailure.invalid("UNSUPPORTED_LAUNCH_ARGUMENT") }
        }
        guard !arguments.contains("--production-controls"), !arguments.contains("--read-only"), !arguments.contains("--control-journal") else { throw ControlFailure.invalid("EXPERIMENT_MODE_REMOVED") }
        let modeText = try value("--mode") ?? "idle"
        guard let mode = Mode(rawValue: modeText) else { throw ControlFailure.invalid("LAUNCH_MODE_INVALID") }
        let rawHome = try value("--home-id")
        let home = rawHome.flatMap(UUID.init(uuidString:))?.uuidString
        if rawHome != nil && home == nil { throw ControlFailure.invalid("ENROLLED_HOME_INVALID") }
        if [.read, .definitions, .control].contains(mode), home == nil { throw ControlFailure.invalid("ENROLLED_HOME_REQUIRED") }
        func path(_ key: String) throws -> String? {
            guard let path = try value(key) else { return nil }
            guard (path as NSString).isAbsolutePath else { throw ControlFailure.invalid("PRIVATE_STATE_PATH_REQUIRED") }
            return path
        }
        let ledger = try path("--lifecycle-directory")
        if [.definitions, .control].contains(mode), ledger == nil { throw ControlFailure.invalid("PRIVATE_LEDGER_REQUIRED") }
        if [.idle, .enrollment, .read].contains(mode), ledger != nil { throw ControlFailure.invalid("READ_MODE_CANNOT_OPEN_MUTATION_LEDGER") }
        self.init(mode: mode, homeId: home, ledgerDirectory: ledger, eventJournal: try path("--event-journal"), pidFile: try path("--pid-file"))
    }
}
