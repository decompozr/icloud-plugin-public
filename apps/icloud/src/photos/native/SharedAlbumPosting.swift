import AppKit
import Photos
import PhotosUI
import Darwin

/// A user-operated experiment. It never exports media or calls addAssets.
@available(macOS 27.0, *)
@MainActor final class SharedAlbumPostingSession: NSObject, PHPickerViewControllerDelegate, @preconcurrency PHSharedAlbumPostingViewController.Delegate, NSWindowDelegate {
    private let operationId: String
    private let assetId: String
    private let asset: PHAsset
    private let album: PHAssetCollection
    private let expiresAt: Double
    private let journal: FileHandle
    private let host = NSViewController()
    private var window: NSWindow!
    private var selected: [PHPickerResult] = []
    private var posting: PHSharedAlbumPostingViewController?
    private var postingStarted = false
    private var finished = false
    private let share = NSButton(title: "Open sharing window", target: nil, action: nil)
    private let label = NSTextField(wrappingLabelWithString: "")

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
    func present() {
        let choose = NSButton(title: "Select photo", target: self, action: #selector(selectPhoto))
        let cancel = NSButton(title: "Cancel", target: self, action: #selector(cancelSession))
        share.target = self; share.action = #selector(openPosting); share.isEnabled = false
        label.stringValue = "Choose the selected photo, then open Apple's sharing window. Destination: " + (album.localizedTitle ?? "Shared Album")
        let stack = NSStackView(views: [label, choose, share, cancel])
        stack.orientation = .vertical; stack.spacing = 14; stack.edgeInsets = NSEdgeInsets(top: 24, left: 24, bottom: 24, right: 24)
        host.view = stack
        window = NSWindow(contentViewController: host); window.title = "Share selected photo"
        window.setContentSize(NSSize(width: 460, height: 230)); window.delegate = self
        window.center(); window.makeKeyAndOrderFront(nil); NSApplication.shared.activate(ignoringOtherApps: true)
        Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, !self.postingStarted else { return }
                if Date().timeIntervalSince1970 * 1000 >= self.expiresAt { self.finish("cancelled_before_posting") }
            }
        }
    }
    @objc private func selectPhoto() {
        guard !postingStarted, Date().timeIntervalSince1970 * 1000 < expiresAt else { return }
        selected = []; share.isEnabled = false
        var configuration = PHPickerConfiguration(photoLibrary: .shared())
        configuration.selectionLimit = 2 // Preselection requires a limit greater than one.
        configuration.preselectedAssetIdentifiers = [asset.localIdentifier]
        configuration.filter = asset.mediaSubtypes.contains(.photoLive) ? .livePhotos : asset.mediaType == .video ? .videos : .images
        let picker = PHPickerViewController(configuration: configuration); picker.delegate = self
        host.presentAsSheet(picker)
    }
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        host.dismiss(picker)
        guard results.count == 1, results[0].assetIdentifier == asset.localIdentifier else {
            finish(results.isEmpty ? "cancelled_before_posting" : "selection_changed_review_required"); return
        }
        selected = results
        let hasData = !results[0].itemProvider.registeredTypeIdentifiers.isEmpty
        do { try record("picker_review", extra: ["selectedAssetIds": [assetId], "itemProviderHasData": hasData]) }
        catch { finish("journal_failed_reconcile_operation"); return }
        label.stringValue = "The selected photo matches. Open Apple's sharing window to review the destination and post."
        // A preselected cancellation can return results too. Never auto-post from
        // the picker callback; require this separate explicit user action.
        share.isEnabled = true
    }
    @objc private func openPosting() {
        guard !postingStarted, selected.count == 1, Date().timeIntervalSince1970 * 1000 < expiresAt,
              PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else { return }
        do { try record("posting_outcome_unknown") }
        catch { finish("journal_failed_reconcile_operation"); return }
        postingStarted = true; share.isEnabled = false
        let controller = PHSharedAlbumPostingViewController(items: selected, defaultAlbumIdentifier: album.localIdentifier, photoLibrary: .shared())
        posting = controller; controller.delegate = self
        host.presentAsSheet(controller)
    }
    func sharedAlbumPostingViewController(_ controller: PHSharedAlbumPostingViewController, didCompleteWithError error: (any Error)?) {
        guard error == nil, let actual = controller.albumIdentifier else { finish("posting_not_verified"); return }
        finish(actual == album.localIdentifier ? "posting_completed_membership_unverified" : "different_destination_membership_unverified", extra: ["actualAlbum": actual])
    }
    @objc private func cancelSession() { finish(postingStarted ? "posting_closed_outcome_unknown" : "cancelled_before_posting") }
    func windowWillClose(_ notification: Notification) { cancelSession() }
}

@MainActor func prepareSharedPostingSession(_ input: [String: Any]) throws -> AnyObject {
    guard #available(macOS 27.0, *) else { try fail("native_sharing_os_unsupported") }
    return try SharedAlbumPostingSession(input: input)
}
@MainActor func presentSharedPostingSession(_ session: AnyObject) {
    if #available(macOS 27.0, *), let session = session as? SharedAlbumPostingSession { session.present() }
}
