import AppKit
import Photos
import PhotosUI
import Darwin
import SwiftUI

/// A user-operated experiment. It never exports media or calls addAssets.
@available(macOS 27.0, *)
@MainActor final class SharedAlbumPostingSession: NSObject, NSWindowDelegate {
    private let operationId: String
    private let assetId: String
    private let asset: PHAsset
    private let album: PHAssetCollection
    private let expiresAt: Double
    private let journal: FileHandle
    private var window: NSWindow!
    private var postingStarted = false
    private var finished = false
    private var pickerVisible = true
    private var pickedItem: PhotosPickerItem?
    private var comparison: [String: Any]?

    init(input: [String: Any]) throws {
        guard let operationId = input["operationId"] as? String, UUID(uuidString: operationId) != nil,
              let directory = input["directory"] as? String, directory.hasPrefix("/"),
              let mutation = input["mutation"] as? [String: Any], mutation["nativeUI"] as? Bool == true,
              mutation["action"] as? String == "post_to_shared_album",
              let ids = mutation["assetIds"] as? [String], ids.count == 1,
              let albumId = mutation["albumId"] as? String, albumId.contains(":shared:"),
              let expiresAt = input["expiresAt"] as? Double,
              expiresAt > Date().timeIntervalSince1970 * 1000,
              expiresAt <= Date().timeIntervalSince1970 * 1000 + 360_000 else { try fail("invalid_request") }
        guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else { try fail("photos_native_permission_required") }
        let attributes = try FileManager.default.attributesOfItem(atPath: directory)
        guard attributes[.type] as? FileAttributeType == .typeDirectory,
              attributes[.posixPermissions] as? Int == 0o700,
              (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
              URL(fileURLWithPath: directory).resolvingSymlinksInPath().path == directory else { try fail("private_review_directory_required") }
        let reserved = open(directory + "/" + operationId + ".reserved", O_RDONLY | O_NOFOLLOW)
        guard reserved >= 0 else { try fail("review_reservation_required") }
        let reservation = FileHandle(fileDescriptor: reserved, closeOnDealloc: true)
        guard String(data: try reservation.read(upToCount: 80) ?? Data(), encoding: .utf8) == operationId else { try fail("review_reservation_required") }
        let assets = try fetchAssets(ids)
        let album = try fetchAlbum(albumId)
        guard album.assetCollectionSubtype == .albumCloudShared else { try fail("shared_album_required") }
        let fd = open(directory + "/" + operationId + ".jsonl", O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600)
        guard fd >= 0 else { try fail("review_identity_already_launched") }
        self.operationId = operationId; self.assetId = ids[0]; self.asset = assets[0]
        self.album = album; self.expiresAt = expiresAt
        self.journal = FileHandle(fileDescriptor: fd, closeOnDealloc: true)
        super.init()
        try record("review_pending")
    }

    private func record(_ status: String, extra: [String: Any] = [:]) throws {
        var event: [String: Any] = ["operationId": operationId, "status": status,
            "timestamp": Date().timeIntervalSince1970 * 1000, "processId": getpid(),
            "localReadbackVerified": false, "serverSyncVerified": false]
        if let comparison { event["comparison"] = comparison }
        for (key, value) in extra { event[key] = value }
        var data = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys]); data.append(10)
        try journal.write(contentsOf: data); try journal.synchronize()
    }
    private func finish(_ status: String, extra: [String: Any] = [:]) {
        guard !finished else { return }; finished = true
        // A failed append retains the last flushed event as an unknown outcome.
        try? record(status, extra: extra)
        NSApplication.shared.terminate(nil)
    }
    private func safeText(_ value: String) -> String {
        var text = value
        for identifier in [assetId, asset.localIdentifier, album.localIdentifier] {
            text = text.replacingOccurrences(of: identifier, with: "[identifier]")
        }
        for pattern in ["[A-Fa-f0-9]{8}-[A-Fa-f0-9-]{27,}", "[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+", "(?:https?|file)://[^\\s]+", "/(?:Users|private|var|Volumes)/[^\\s]+"] {
            text = text.replacingOccurrences(of: pattern, with: "[redacted]", options: .regularExpression)
        }
        return String(text.prefix(512))
    }
    private func errorDetails(_ error: Error) -> [[String: Any]] {
        var result: [[String: Any]] = []
        var current: NSError? = error as NSError
        for _ in 0..<3 {
            guard let native = current else { break }
            result.append(["domain": safeText(native.domain), "code": native.code,
                "description": safeText(native.localizedDescription),
                "reason": safeText(native.localizedFailureReason ?? ""),
                "debug": safeText(native.userInfo[NSDebugDescriptionErrorKey] as? String ?? "")])
            current = native.userInfo[NSUnderlyingErrorKey] as? NSError
        }
        return result
    }
    private func inspect(_ item: PhotosPickerItem) async -> [String: Any] {
        var result: [String: Any] = ["identifierMatches": item.itemIdentifier == asset.localIdentifier,
            "contentTypes": item.supportedContentTypes.map(\.identifier)]
        do {
            let live = try await item.loadTransferable(type: PHLivePhoto.self)
            result["livePhotoLoaded"] = live != nil
        } catch {
            result["livePhotoLoaded"] = false
            result["errors"] = errorDetails(error)
        }
        return result
    }
    func present() {
        guard Date().timeIntervalSince1970 * 1000 < expiresAt else { finish("cancelled_before_posting"); return }
        let selected = Binding<PhotosPickerItem?>(get: { [weak self] in self?.pickedItem }, set: { [weak self] item in
            guard let self, !self.finished, self.pickedItem == nil, let item else { return }
            guard item.itemIdentifier == self.asset.localIdentifier else { self.finish("selection_changed_review_required"); return }
            self.pickedItem = item
            self.pickerVisible = false
            Task { @MainActor [weak self] in
                guard let self else { return }
                let idOnly = PhotosPickerItem(itemIdentifier: self.asset.localIdentifier)
                let baseline = await self.inspect(idOnly)
                let actual = await self.inspect(item)
                guard !self.finished else { return }
                self.comparison = ["identifierOnly": baseline, "userSelected": actual, "itemsEqual": idOnly == item]
                do { try self.record("picker_review", extra: ["selectedAssetIds": [self.assetId]]) }
                catch { self.finish("journal_failed_reconcile_operation"); return }
                // Preserve an explicit review step. No callback automatically posts.
                let button = NSButton(title: "Open sharing window — do not Post", target: self, action: #selector(self.openSelectedPosting))
                let label = NSTextField(wrappingLabelWithString: "Selection matches. Comparison recorded. Open Apple's sharing window, observe the photo, then Cancel.")
                let stack = NSStackView(views: [label, button]); stack.orientation = .vertical; stack.spacing = 16
                stack.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
                self.window.contentViewController = nil; self.window.contentView = stack
            }
        })
        let visible = Binding<Bool>(get: { [weak self] in self?.pickerVisible == true }, set: { [weak self] visible in
            guard let self else { return }; self.pickerVisible = visible
            if !visible { DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                guard let self, self.pickedItem == nil else { return }; self.finish("cancelled_before_posting")
            } }
        })
        let view = Text("Select the previously approved photo once. This experiment does not press Post.")
            .padding(24).frame(width: 460, height: 180)
            .photosPicker(isPresented: visible, selection: selected, matching: .livePhotos,
                preferredItemEncoding: .current, photoLibrary: .shared())
        window = NSWindow(contentViewController: NSHostingController(rootView: view))
        window.title = "Shared Album input comparison"; window.delegate = self
        window.center(); window.makeKeyAndOrderFront(nil); NSApplication.shared.activate(ignoringOtherApps: true)
        Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, !self.postingStarted, !self.finished else { return }
                if Date().timeIntervalSince1970 * 1000 >= self.expiresAt { self.finish("cancelled_before_posting") }
            }
        }
    }
    @objc private func openSelectedPosting() {
        guard !postingStarted, !finished, let item = pickedItem,
              Date().timeIntervalSince1970 * 1000 < expiresAt,
              PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else { return }
        do { try record("posting_outcome_unknown", extra: ["selectedAssetIds": [assetId]]) }
        catch { finish("journal_failed_reconcile_operation"); return }
        postingStarted = true
        let presented = Binding<Bool>(get: { [weak self] in self?.finished == false }, set: { [weak self] visible in
            if !visible {
                // Give the completion callback an opportunity to record its result.
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                    self?.finish("posting_closed_outcome_unknown")
                }
            }
        })
        let view = Text("Review the selected photo in Apple's sharing window.")
            .padding(24).frame(width: 460, height: 180)
            .photosSharedAlbumPostingSheet(isPresented: presented, items: [item],
                defaultAlbumIdentifier: album.localIdentifier, photoLibrary: .shared()) { [weak self] result in
                guard let self else { return }
                switch result {
                case .success(let actual):
                    self.finish(actual == self.album.localIdentifier ? "posting_completed_membership_unverified" : "different_destination_membership_unverified", extra: ["actualAlbum": actual])
                case .failure(let error):
                    let native = error as NSError
                    self.finish("posting_not_verified", extra: ["nativeErrorDomain": native.domain, "nativeErrorCode": native.code, "nativeErrorDetails": self.errorDetails(error)])
                }
            }
        let controller = NSHostingController(rootView: view)
        window.contentViewController = controller; window.title = "Share selected photo — cancel after observing"
        window.delegate = self
        window.center(); window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate(ignoringOtherApps: true)
    }
    func windowWillClose(_ notification: Notification) {
        finish(postingStarted ? "posting_closed_outcome_unknown" : "cancelled_before_posting")
    }
}

@MainActor func prepareSharedPostingSession(_ input: [String: Any]) throws -> AnyObject {
    guard #available(macOS 27.0, *) else { try fail("native_sharing_os_unsupported") }
    return try SharedAlbumPostingSession(input: input)
}
@MainActor func presentSharedPostingSession(_ session: AnyObject) {
    if #available(macOS 27.0, *), let session = session as? SharedAlbumPostingSession { session.present() }
}
