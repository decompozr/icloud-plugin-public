import AppKit
import Photos
import PhotosUI
import SwiftUI
import Darwin

// Standalone read-only experiment. No production Helper or posting code is linked.
struct Request: Decodable { let assetId: String; let sessionId: UUID }
struct ExperimentError: Error { let message: String }
@available(macOS 27.0, *)
@MainActor final class Experiment: NSObject, NSWindowDelegate {
    let request: Request
    let journal: FileHandle
    var asset: PHAsset?
    var selected: PhotosPickerItem?
    var pickerVisible = false
    var finished = false
    var selecting = false
    var window: NSWindow!
    let label = NSTextField(wrappingLabelWithString: "Read-only input comparison. No sharing window or publication is implemented.")
    var baseline: [String: Any]?
    init(request: Request, directory: String) throws {
        self.request = request
        let attrs = try FileManager.default.attributesOfItem(atPath: directory)
        guard URL(fileURLWithPath: directory).resolvingSymlinksInPath().path == directory,
              attrs[.type] as? FileAttributeType == .typeDirectory,
              attrs[.posixPermissions] as? Int == 0o700,
              (attrs[.ownerAccountID] as? NSNumber)?.uint32Value == getuid() else {
            throw ExperimentError(message: "Evidence directory must be an owner-only real directory (0700).")
        }
        guard request.assetId.range(of: "^asset:[a-f0-9]{16}:[A-Fa-f0-9-]{36}$", options: .regularExpression) != nil,
              UUID(uuidString: String(request.assetId.split(separator: ":").last!)) != nil else {
            throw ExperimentError(message: "Invalid scoped asset ID.")
        }
        let fd = open(directory + "/" + request.sessionId.uuidString.lowercased() + ".jsonl", O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw ExperimentError(message: "Session already exists or journal cannot be created. No relaunch.") }
        journal = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        super.init()
        try record("started")
    }
    func record(_ status: String, _ extra: [String: Any] = [:]) throws {
        var event: [String: Any] = ["sessionId": request.sessionId.uuidString.lowercased(), "status": status,
            "timestamp": Date().timeIntervalSince1970 * 1000, "processId": getpid(), "readOnly": true, "publicationImplemented": false]
        for (k, v) in extra { event[k] = v }
        var data = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]); data.append(10)
        try journal.write(contentsOf: data); try journal.synchronize()
    }
    func finish(_ status: String, _ extra: [String: Any] = [:]) {
        guard !finished else { return }; finished = true
        do { try record(status, extra) } catch { label.stringValue = "Cannot save diagnostic evidence." }
        NSApplication.shared.terminate(nil)
    }
    func redact(_ text: String) -> String {
        var result = text.replacingOccurrences(of: request.assetId, with: "[asset]")
        for pattern in ["[A-Fa-f0-9]{8}-[A-Fa-f0-9-]{27,}", "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+", "(?:https?|file)://[^\\s]+", "/(?:Users|private|var|Volumes)/[^\\s]+"] {
            result = result.replacingOccurrences(of: pattern, with: "[redacted]", options: .regularExpression)
        }
        return String(result.prefix(512))
    }
    func errors(_ error: Error) -> [[String: Any]] {
        var chain: [[String: Any]] = []; var current: NSError? = error as NSError
        for _ in 0..<3 {
            guard let e = current else { break }
            chain.append(["domain": redact(e.domain), "code": e.code, "description": redact(e.localizedDescription),
                "reason": redact(e.localizedFailureReason ?? ""), "debug": redact(e.userInfo[NSDebugDescriptionErrorKey] as? String ?? "")])
            current = e.userInfo[NSUnderlyingErrorKey] as? NSError
        }
        return chain
    }
    func inspect(_ item: PhotosPickerItem, group: String) async -> [String: Any] {
        var result: [String: Any] = ["identifierMatches": item.itemIdentifier == asset?.localIdentifier,
            "contentTypes": Array(item.supportedContentTypes.prefix(64)).map(\.identifier)]
        do {
            try record("loading", ["input": group])
            let live = try await item.loadTransferable(type: PHLivePhoto.self)
            result["livePhotoLoaded"] = live != nil
            if let live { result["size"] = ["width": live.size.width, "height": live.size.height] }
        } catch { result["livePhotoLoaded"] = false; result["errors"] = errors(error) }
        return result
    }
    func present() {
        let button = NSButton(title: "Start read-only comparison", target: self, action: #selector(start))
        let stack = NSStackView(views: [label, button]); stack.orientation = .vertical; stack.spacing = 18
        stack.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 220), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.contentView = stack; window.title = "Photos input experiment — read only"; window.delegate = self
        window.center(); window.makeKeyAndOrderFront(nil); NSApplication.shared.activate(ignoringOtherApps: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 600) { [weak self] in self?.finish("expired") }
    }
    @objc func start() {
        guard !selecting, !finished else { return }; selecting = true
        Task { @MainActor in
            let authorization = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            guard !self.finished else { return }
            guard authorization == .authorized else { self.finish("permission_required", ["authorization": authorization.rawValue]); return }
            let uuid = String(self.request.assetId.split(separator: ":").last!)
            guard let asset = PHAsset.fetchAssets(withLocalIdentifiers: [uuid + "/L0/001"], options: nil).firstObject,
                  asset.mediaSubtypes.contains(.photoLive) else { self.finish("approved_live_photo_not_found"); return }
            self.asset = asset
            let baseline = await self.inspect(PhotosPickerItem(itemIdentifier: asset.localIdentifier), group: "identifierOnly")
            guard !self.finished else { return }; self.baseline = baseline
            do { try self.record("baseline_completed", ["identifierOnly": baseline]) }
            catch { self.finish("journal_failed"); return }
            self.presentPicker()
        }
    }
    func presentPicker() {
        pickerVisible = true
        let selected = Binding<PhotosPickerItem?>(get: { [weak self] in self?.selected }, set: { [weak self] item in
            guard let self, !self.finished, self.selected == nil, let item else { return }
            guard item.itemIdentifier == self.asset?.localIdentifier else { self.finish("selection_mismatch"); return }
            self.selected = item; self.pickerVisible = false
            Task { @MainActor in
                let actual = await self.inspect(item, group: "userSelected")
                guard !self.finished, let baseline = self.baseline, let asset = self.asset else { return }
                self.finish("comparison_completed", ["identifierOnly": baseline, "userSelected": actual,
                    "itemsEqual": PhotosPickerItem(itemIdentifier: asset.localIdentifier) == item])
            }
        })
        let visible = Binding<Bool>(get: { [weak self] in self?.pickerVisible == true }, set: { [weak self] value in
            guard let self else { return }; self.pickerVisible = value
            if !value { DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                guard let self, self.selected == nil else { return }; self.finish("cancelled")
            } }
        })
        let view = Text("Select only the agreed original Live Photo. The experiment closes after saving the comparison; nothing is posted.")
            .padding(24).frame(width: 520, height: 220)
            .photosPicker(isPresented: visible, selection: selected, matching: .livePhotos, preferredItemEncoding: .current, photoLibrary: .shared())
        window.contentViewController = NSHostingController(rootView: view)
    }
    func windowWillClose(_ notification: Notification) { finish("cancelled") }
}
@main struct Main {
    @MainActor static func main() {
        do {
            guard #available(macOS 27.0, *) else { throw ExperimentError(message: "macOS 27 or later required.") }
            let args = CommandLine.arguments
            guard let index = args.firstIndex(of: "--request"), index + 1 < args.count,
                  let evidenceIndex = args.firstIndex(of: "--evidence"), evidenceIndex + 1 < args.count else {
                throw ExperimentError(message: "Launch with --request private-request.json --evidence private-directory")
            }
            let data = try Data(contentsOf: URL(fileURLWithPath: args[index + 1]))
            guard data.count < 4096 else { throw ExperimentError(message: "Request too large.") }
            let request = try JSONDecoder().decode(Request.self, from: data)
            NSApplication.shared.setActivationPolicy(.regular)
            let experiment = try Experiment(request: request, directory: args[evidenceIndex + 1])
            experiment.present(); NSApplication.shared.run(); withExtendedLifetime(experiment) {}
        } catch {
            // Do not expose raw filesystem errors or asset identifiers.
            fputs("Photos input experiment could not start. Check request, private evidence directory, OS version and session uniqueness.\n", stderr)
            exit(1)
        }
    }
}
