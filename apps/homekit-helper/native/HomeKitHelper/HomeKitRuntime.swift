import Foundation
import HomeKit
import UIKit
import Darwin
import CryptoKit
import CoreFoundation

final class HomeKitRuntime: NSObject, HMHomeManagerDelegate {
    static let shared = HomeKitRuntime()
    var manager: HMHomeManager!
    var ready = false
    let launch = (try? LaunchConfiguration(arguments: CommandLine.arguments)) ?? .idle
    let transport = JSONRPCTransport()
    lazy var catalog = HomeCatalog(runtime: self)
    lazy var events = HomeEvents(runtime: self)
    lazy var definitions = HomeDefinitions(runtime: self)
    lazy var controls = HomeControls(runtime: self)
    lazy var rpc = HelperRPC(runtime: self)
    var homes: [HMHome] { (manager?.homes ?? []).filter { launch.homeId == nil || $0.uniqueIdentifier.uuidString == launch.homeId } }
    var homeAuthorized: Bool { manager?.authorizationStatus.contains(.authorized) ?? false }
    func start() {
        guard launch.mode != .idle else { fputs("HomeKitHelper requires explicit broker configuration\n", stderr); exit(64) }
        if let path = launch.pidFile { FileManager.default.createFile(atPath: path, contents: String(ProcessInfo.processInfo.processIdentifier).data(using: .utf8), attributes: [.posixPermissions: 0o600]) }
        if let path = launch.eventJournal {
            let url = URL(fileURLWithPath: path)
            do {
                try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
                if !FileManager.default.fileExists(atPath: path), !FileManager.default.createFile(atPath: path, contents: nil, attributes: [.posixPermissions: 0o600]) { throw ControlFailure.invalid("EVENT_JOURNAL_OPEN_FAILED") }
                events.eventJournal = url
            } catch { events.eventJournalErrors += 1 }
        }
        if let path = launch.ledgerDirectory {
            do {
                let directory = URL(fileURLWithPath: path)
                definitions.lifecycleStore = try LifecycleStore(directory: directory)
                definitions.lifecycleJournal = try ControlJournal(url: directory.appendingPathComponent("operations.jsonl"))
                if launch.mode == .control { controls.controlJournal = try ControlJournal(url: directory.appendingPathComponent("control-operations.jsonl")) }
            } catch { definitions.lifecycleError = String(describing: error) }
        }
        manager = HMHomeManager(); manager.delegate = self
        transport.start { self.rpc.handle($0) }
    }
    func adoptManager(_ replacement: HMHomeManager) { manager = replacement; manager.delegate = self; homeManagerDidUpdateHomes(replacement) }
    func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        ready = true
        if definitions.lifecycleStore != nil { for home in homes { home.delegate = definitions } }
    }
    func status() -> [String: Any] {
        ["mode": launch.mode.rawValue, "enrolledHomeId": launch.homeId ?? NSNull(), "ready": ready,
         "processId": ProcessInfo.processInfo.processIdentifier, "localUserId": Int(getuid()),
         "presentationMode": HelperPresentation.showsWindow(CommandLine.arguments) ? "window" : "background",
         "visibleWindowCount": UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap { $0.windows }.filter { !$0.isHidden }.count,
         "authorizationStatus": manager.authorizationStatus.rawValue,
         "authorized": manager.authorizationStatus.contains(.authorized),
         "homeCount": ready ? homes.count : 0,
         "sequence": self.events.sequence, "subscriptionFailures": self.events.subscriptionFailures,
         "subscriptionsPending": self.events.subscriptionsPending, "subscriptionsEnabled": self.events.subscriptionsEnabled,
         "eventJournalEnabled": self.events.eventJournal != nil, "eventJournalErrors": self.events.eventJournalErrors,
         "resourceSubscriptions": events.resourceSubscribers.count,
         "eventSession": self.events.eventSession,
         "lifecycleEnabled": definitions.lifecycleStore != nil && definitions.lifecycleJournal != nil && definitions.lifecycleError == nil,
         "lifecycleError": definitions.lifecycleError ?? NSNull(), "physicalControlEnabled": controls.controlEnabled, "controlJournalError": controls.controlJournalError ?? NSNull(),
         "deliveryEnabled": false]
    }

}
