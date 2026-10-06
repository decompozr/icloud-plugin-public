import AppKit
import Photos
import PhotosUI
import SwiftUI
import Darwin

// Standalone read-only experiment. No production Helper or posting code is linked.
struct Request: Decodable { let sessionId: UUID; let assetId: String?; let albumUUID: String?; let postingTest: Bool?; let chooseDestinationInSheet: Bool? }
struct ExperimentError: Error { let message: String }
@available(macOS 27.0, *)
@MainActor final class Experiment: NSObject, NSWindowDelegate {
    let request: Request
    let journal: FileHandle
    var selected: [PhotosPickerItem] = []
    var postingStarted = false
    var postingVisible = false
    var targetAlbum: PHAssetCollection?
    var processing = false
    var pickerVisible = false
    var finished = false
    var selecting = false
    var window: NSWindow!
    let label = NSTextField(wrappingLabelWithString: "Preparing the requested experiment…")
    init(request: Request, directory: String) throws {
        self.request = request
        let attrs = try FileManager.default.attributesOfItem(atPath: directory)
        guard URL(fileURLWithPath: directory).resolvingSymlinksInPath().path == directory,
              attrs[.type] as? FileAttributeType == .typeDirectory,
              attrs[.posixPermissions] as? Int == 0o700,
              (attrs[.ownerAccountID] as? NSNumber)?.uint32Value == getuid() else {
            throw ExperimentError(message: "Evidence directory must be an owner-only real directory (0700).")
        }
        let fd = open(directory + "/" + request.sessionId.uuidString.lowercased() + ".jsonl", O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { throw ExperimentError(message: "Session already exists or journal cannot be created. No relaunch.") }
        journal = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        super.init()
        try record("started")
    }
    func record(_ status: String, _ extra: [String: Any] = [:]) throws {
        var event: [String: Any] = ["sessionId": request.sessionId.uuidString.lowercased(), "status": status,
            "timestamp": Date().timeIntervalSince1970 * 1000, "processId": getpid(), "readOnly": request.postingTest != true, "publicationImplemented": request.postingTest == true]
        for (k, v) in extra where k != "status" { event[k] = v }
        var data = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]); data.append(10)
        try journal.write(contentsOf: data); try journal.synchronize()
    }
    func finish(_ status: String, _ extra: [String: Any] = [:]) {
        guard !finished else { return }; finished = true
        do { try record(status, extra) } catch { label.stringValue = "Cannot save diagnostic evidence." }
        guard window != nil else { NSApplication.shared.terminate(nil); return }
        window.contentViewController = nil
        label.stringValue = "Experiment stopped: \(status).\nNo automatic retry. Details have been saved."
        let close = NSButton(title: "Close experiment", target: self, action: #selector(closeResult))
        let stack = NSStackView(views: [label, close]); stack.orientation = .vertical; stack.spacing = 16
        stack.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
        window.contentView = stack
    }
    func redact(_ text: String) -> String {
        var result = text
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
    func inspect(_ item: PhotosPickerItem, expectedIdentifier: String, group: String) async -> [String: Any] {
        var result: [String: Any] = ["identifierMatches": item.itemIdentifier == expectedIdentifier,
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
        let button = NSButton(title: "Select Live Photos to compare", target: self, action: #selector(start))
        let stack = NSStackView(views: [label, button]); stack.orientation = .vertical; stack.spacing = 18
        stack.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 520, height: 220), styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.contentView = stack; window.title = request.postingTest == true ? "Live Photo manual posting experiment" : "Photos input experiment — read only"; window.delegate = self
        window.center(); window.makeKeyAndOrderFront(nil); NSApplication.shared.activate(ignoringOtherApps: true)
        if request.assetId != nil || request.postingTest == true { start() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 600) { [weak self] in guard let self, !self.postingStarted else { return }; self.finish("expired") }
    }
    @objc func start() {
        guard !selecting, !finished else { return }; selecting = true
        Task { @MainActor in
            let authorization = await PHPhotoLibrary.requestAuthorization(for: .readWrite)
            guard !self.finished else { return }
            guard authorization == .authorized else { self.finish("permission_required", ["authorization": authorization.rawValue]); return }
            if self.request.postingTest == true {
                guard let expected = self.request.albumUUID else { self.finish("target_required"); return }
                let albums = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil)
                var candidates: [[String: Any]] = []
                albums.enumerateObjects { album, _, _ in
                    if album.localIdentifier.split(separator: "/").first.map(String.init)?.caseInsensitiveCompare(expected) == .orderedSame { self.targetAlbum = album }
                    if album.localizedTitle == "Live Photo Share Test" {
                        candidates.append(["localIdentifier": album.localIdentifier, "title": album.localizedTitle ?? "", "subtype": album.assetCollectionSubtype.rawValue, "count": PHAsset.fetchAssets(in: album, options: nil).count])
                    }
                }
                do { try self.record("target_lookup", ["expectedUUID": expected, "sameTitleCandidates": candidates, "collectionsExamined": albums.count]) }
                catch { self.finish("journal_failed"); return }
                guard let album = self.targetAlbum, album.assetCollectionSubtype == .albumCloudShared else {
                    self.finish("exact_shared_album_not_found", ["collectionsExamined": albums.count]); return
                }
                do { try self.record("target_verified", ["targetAlbumIdentifier": album.localIdentifier, "title": album.localizedTitle ?? ""]) }
                catch { self.finish("journal_failed"); return }
                self.presentPicker(); return
            }
            if let assetId = self.request.assetId { await self.compareDirect(assetId); return }
            self.presentPicker()
        }
    }
    func inspectRoutes(_ live: PHLivePhoto, asset: PHAsset) async -> [String: Any] {
        // Discovery only: never invoke a sharing service or perform Photos changes.
        let services = NSSharingService.sharingServices(forItems: [live]).map(\.title)
        let provider = NSItemProvider(item: live, typeIdentifier: "com.apple.live-photo")
        let providerServices = NSSharingService.sharingServices(forItems: [provider]).map(\.title)
        let canLoad = provider.canLoadObject(ofClass: PHLivePhoto.self)
        let roundTrip: [String: Any] = await withCheckedContinuation { continuation in
            provider.loadObject(ofClass: PHLivePhoto.self) { object, error in
                Task { @MainActor in
                    var result: [String: Any] = ["livePhotoLoaded": object is PHLivePhoto]
                    if let photo = object as? PHLivePhoto { result["size"] = ["width": photo.size.width, "height": photo.size.height] }
                    if let error { result["errors"] = self.errors(error) }
                    continuation.resume(returning: result)
                }
            }
        }
        let resources = PHAssetResource.assetResources(for: asset).map { ["type": $0.type.rawValue, "uniformTypeIdentifier": $0.uniformTypeIdentifier] as [String: Any] }
        var routes: [String: Any] = ["liveObjectSharingServices": services, "providerSharingServices": providerServices,
            "customProvider": ["registeredTypes": provider.registeredTypeIdentifiers, "canLoadLivePhoto": canLoad, "roundTrip": roundTrip],
            "sourceResources": resources, "resourcesExported": false, "sharingServicePerformed": false]
        if let expected = request.albumUUID {
            let albums = PHAssetCollection.fetchAssetCollections(with: .album, subtype: .albumCloudShared, options: nil)
            var target: PHAssetCollection?
            albums.enumerateObjects { album, _, _ in if album.localIdentifier.split(separator: "/").first.map(String.init) == expected { target = album } }
            routes["photoKitAlbum"] = ["exactTargetFound": target != nil, "canAddContent": target?.canPerform(.addContent) ?? false, "writeAttempted": false]
        }
        return routes
    }
    func compareDirect(_ assetId: String) async {
        guard assetId.range(of: "^asset:[a-f0-9]{16}:[A-Fa-f0-9-]{36}$", options: .regularExpression) != nil,
              let uuid = assetId.split(separator: ":").last,
              UUID(uuidString: String(uuid)) != nil,
              let asset = PHAsset.fetchAssets(withLocalIdentifiers: [String(uuid) + "/L0/001"], options: nil).firstObject,
              asset.mediaSubtypes.contains(.photoLive) else { finish("approved_live_photo_not_found"); return }
        label.stringValue = "Loading the approved Live Photo directly with PhotoKit. No picker is opened."
        let idOnly = PhotosPickerItem(itemIdentifier: asset.localIdentifier)
        let before = await inspect(idOnly, expectedIdentifier: asset.localIdentifier, group: "identifierBeforeDirectLoad")
        guard !finished else { return }
        let options = PHLivePhotoRequestOptions(); options.deliveryMode = .highQualityFormat
        options.version = .current; options.isNetworkAccessAllowed = true
        let direct: [String: Any] = await withCheckedContinuation { continuation in
            var completed = false
            PHImageManager.default().requestLivePhoto(for: asset,
                targetSize: CGSize(width: asset.pixelWidth, height: asset.pixelHeight), contentMode: .aspectFit, options: options) { live, info in
                Task { @MainActor in
                    guard !completed else { return }
                    if (info?[PHImageResultIsDegradedKey] as? Bool) == true { return }
                    completed = true
                    var result: [String: Any] = ["livePhotoLoaded": live != nil, "degraded": false,
                        "cancelled": (info?[PHImageCancelledKey] as? Bool) == true]
                    if let live {
                        result["size"] = ["width": live.size.width, "height": live.size.height]
                        result["routes"] = await self.inspectRoutes(live, asset: asset)
                    }
                    if let error = info?[PHImageErrorKey] as? Error { result["errors"] = self.errors(error) }
                    continuation.resume(returning: result)
                }
            }
        }
        guard !finished else { return }
        let after = await inspect(PhotosPickerItem(itemIdentifier: asset.localIdentifier), expectedIdentifier: asset.localIdentifier, group: "identifierAfterDirectLoad")
        guard !finished else { return }
        do { try record("direct_comparison_completed", ["identifierBefore": before, "photoKitDirect": direct,
            "identifierAfter": after, "pickerOpened": false, "sameSource": true]) }
        catch { finish("journal_failed"); return }
        finished = true
        label.stringValue = "Direct comparison saved. No picker or sharing.\n\nPhotoKit loaded Live Photo: \(direct["livePhotoLoaded"]!)\nIdentifier item before: \(before["livePhotoLoaded"]!)\nIdentifier item after: \(after["livePhotoLoaded"]!)"
        let close = NSButton(title: "Done — close experiment", target: self, action: #selector(closeResult))
        let stack = NSStackView(views: [label, close]); stack.orientation = .vertical; stack.spacing = 16
        stack.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
        window.contentView = stack; window.setContentSize(NSSize(width: 540, height: 280))
    }
    func presentPicker() {
        pickerVisible = true
        let selected = Binding<[PhotosPickerItem]>(get: { [weak self] in self?.selected ?? [] }, set: { [weak self] items in
            guard let self, !self.finished, !self.processing else { return }
            self.selected = items
        })
        let visible = Binding<Bool>(get: { [weak self] in self?.pickerVisible == true }, set: { [weak self] value in
            guard let self else { return }; self.pickerVisible = value
            if !value { DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                guard let self else { return }; self.compareSelection()
            } }
        })
        let view = Text(request.postingTest == true ? "Select one Live Photo, then Add/Done. The original selected item will be retained for the Apple sharing window." : "Select up to 12 Live Photos, then click Add or Done in the picker. Each selected photo is compared with its own identifier-created input. Nothing is posted.")
            .padding(24).frame(width: 520, height: 220)
            .photosPicker(isPresented: visible, selection: selected, maxSelectionCount: request.postingTest == true ? 1 : 12, matching: .livePhotos, preferredItemEncoding: .current, photoLibrary: .shared())
        window.contentViewController = NSHostingController(rootView: view)
    }
    func compareSelection() {
        guard !processing, !finished else { return }
        guard !selected.isEmpty else { finish("cancelled"); return }
        processing = true
        window.contentViewController = nil
        label.stringValue = "Comparing \(selected.count) selected Live Photos…"
        window.contentView = label
        Task { @MainActor in
            var comparisons: [[String: Any]] = []
            for (index, item) in self.selected.enumerated() {
                guard !self.finished else { return }
                guard let identifier = item.itemIdentifier else {
                    comparisons.append(["index": index + 1, "status": "picker_identifier_missing", "contentTypes": item.supportedContentTypes.map(\.identifier)])
                    continue
                }
                let idOnly = PhotosPickerItem(itemIdentifier: identifier)
                let baseline = await self.inspect(idOnly, expectedIdentifier: identifier, group: "identifierOnly[\(index + 1)]")
                let actual = await self.inspect(item, expectedIdentifier: identifier, group: "userSelected[\(index + 1)]")
                guard !self.finished else { return }
                let comparison: [String: Any] = ["index": index + 1, "status": "compared", "identifierOnly": baseline,
                    "userSelected": actual, "itemsEqual": idOnly == item]
                comparisons.append(comparison)
                do { try self.record("item_compared", comparison) } catch { self.finish("journal_failed"); return }
            }
            do { try self.record("comparison_completed", ["count": comparisons.count, "comparisons": comparisons]) }
            catch { self.finish("journal_failed"); return }
            if self.request.postingTest == true {
                guard self.selected.count == 1,
                      let actual = comparisons.first?["userSelected"] as? [String: Any], actual["livePhotoLoaded"] as? Bool == true else {
                    self.finish("selected_live_photo_load_failed"); return
                }
                do { try self.record("ready_for_manual_post", ["selectedLocalIdentifiers": self.selected.compactMap(\.itemIdentifier)]) }
                catch { self.finish("journal_failed"); return }
                let explanation = NSTextField(wrappingLabelWithString: "The actual selected item loaded successfully and remains in memory. Open Apple's sheet, verify Live Photo Share Test, then press Post for this authorized test.")
                let post = NSButton(title: "Open Apple sharing window", target: self, action: #selector(self.openPosting))
                let stack = NSStackView(views: [explanation, post]); stack.orientation = .vertical; stack.spacing = 16
                stack.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
                self.window.contentView = stack; return
            }
            self.finished = true
            let summary = comparisons.map { c -> String in
                guard let a = c["identifierOnly"] as? [String: Any], let b = c["userSelected"] as? [String: Any] else {
                    return "Photo \(c["index"]!): picker did not provide an identifier."
                }
                return "Photo \(c["index"]!): ID input loaded Live Photo = \(a["livePhotoLoaded"]!), selected input loaded = \(b["livePhotoLoaded"]!)"
            }.joined(separator: "\n\n")
            let result = NSTextField(wrappingLabelWithString: "Comparison saved. No photos posted.\n\n" + summary)
            let close = NSButton(title: "Done — close experiment", target: self, action: #selector(self.closeResult))
            let stack = NSStackView(views: [result, close]); stack.orientation = .vertical; stack.spacing = 16
            stack.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
            self.window.contentView = stack
            self.window.setContentSize(NSSize(width: 640, height: min(720, 140 + comparisons.count * 55)))
        }
    }
    @objc func openPosting() {
        guard request.postingTest == true, !postingStarted, !finished, selected.count == 1, let targetAlbum else { return }
        do { try record("posting_sheet_requested", ["targetAlbumIdentifier": targetAlbum.localIdentifier, "defaultAlbumSupplied": request.chooseDestinationInSheet != true]) }
        catch { finish("journal_failed"); return }
        postingStarted = true; postingVisible = true
        let visible = Binding<Bool>(get: { [weak self] in self?.postingVisible == true }, set: { [weak self] value in
            guard let self else { return }; self.postingVisible = value
            if !value { DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                guard let self, !self.finished else { return }
                self.showPostingResult("sheet_closed_outcome_unknown")
            } }
        })
        let view = Text("Use Apple's Post button only after verifying the selected photo and destination. No automatic Post or retry.")
            .padding(24).frame(width: 560, height: 240)
            .photosSharedAlbumPostingSheet(isPresented: visible, items: selected,
                defaultAlbumIdentifier: request.chooseDestinationInSheet == true ? nil : targetAlbum.localIdentifier, photoLibrary: .shared()) { [weak self] result in
                guard let self else { return }
                switch result {
                case .success(let actual):
                    self.showPostingResult(actual == targetAlbum.localIdentifier ? "posting_completed_membership_unverified" : "different_destination_membership_unverified", ["actualAlbumIdentifier": actual])
                case .failure(let error): self.showPostingResult("posting_failed_or_cancelled", ["errors": self.errors(error)])
                }
            }
        window.contentViewController = NSHostingController(rootView: view)
    }
    func showPostingResult(_ status: String, _ extra: [String: Any] = [:]) {
        guard !finished else { return }
        do { try record(status, extra) } catch { label.stringValue = "Journal failed; preserve this session." }
        finished = true
        window.contentViewController = nil
        label.stringValue = "Apple result recorded: \(status).\nDestination membership and Live playback still require separate verification."
        let close = NSButton(title: "Close experiment", target: self, action: #selector(closeResult))
        let stack = NSStackView(views: [label, close]); stack.orientation = .vertical; stack.spacing = 16
        stack.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
        window.contentView = stack
    }
    @objc func closeResult() { NSApplication.shared.terminate(nil) }
    func windowWillClose(_ notification: Notification) { if finished { closeResult() } else { finish(postingStarted ? "closed_outcome_unknown" : "cancelled") } }
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
