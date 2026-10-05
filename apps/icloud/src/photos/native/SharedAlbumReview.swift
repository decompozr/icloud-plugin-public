import AppKit
import Photos
import PhotosUI
import Darwin

// User-presented macOS 27 posting flow. Never calls performChanges for sharing.
@available(macOS 27.0, *)
@MainActor
final class SharedAlbumReview: NSObject, NSWindowDelegate, PHPickerViewControllerDelegate,
    @MainActor PHSharedAlbumPostingViewController.Delegate {
    private let asset: PHAsset
    private let album: PHAssetCollection
    private let operationId: String
    private let journal: ReviewJournal
    private var phase = "review_pending"
    private var window: NSWindow!
    private let root = NSViewController()
    private var presented: NSViewController?
    private var imageRequest: PHImageRequestID?

    init(input: [String: Any]) throws {
        guard let mutation = input["mutation"] as? [String: Any],
              mutation["action"] as? String == "post_to_shared_album",
              let ids = mutation["assetIds"] as? [String], ids.count == 1,
              let target = mutation["albumId"] as? String, target.contains(":shared:"),
              let id = input["operationId"] as? String, UUID(uuidString: id) != nil,
              let directory = input["reviewDirectory"] as? String, directory.hasPrefix("/") else { try fail("invalid_request") }
        guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else { try fail("photos_native_permission_required") }
        asset = try fetchAssets(ids)[0]
        album = try fetchAlbum(target)
        guard album.assetCollectionSubtype == .albumCloudShared else { try fail("shared_album_required") }
        operationId = id
        journal = try ReviewJournal(directory: directory, operationId: id)
        super.init()
        try record("review_pending")
    }

    func show() {
        root.view = NSView(frame: NSRect(x: 0, y: 0, width: 640, height: 620))
        window = NSWindow(contentRect: root.view.frame, styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Review Photos sharing"
        window.contentViewController = root
        window.delegate = self
        window.isReleasedWhenClosed = false
        let label = NSTextField(wrappingLabelWithString: "Destination: \(album.localizedTitle ?? "Shared Album")\n\(album.localIdentifier)\nOne photo/video. Family members may see it. Verify the destination again in the system posting sheet.")
        label.frame = NSRect(x: 24, y: 490, width: 592, height: 105)
        root.view.addSubview(label)
        let image = NSImageView(frame: NSRect(x: 24, y: 140, width: 592, height: 340))
        image.imageScaling = .scaleProportionallyUpOrDown
        root.view.addSubview(image)
        let detail = NSTextField(wrappingLabelWithString: "\(asset.creationDate?.description ?? "Unknown capture date") · \(asset.mediaType == .video ? "Video preview only; review full video in Photos" : "Photo preview")\nPreview loading")
        detail.frame = NSRect(x: 24, y: 80, width: 592, height: 55)
        root.view.addSubview(detail)
        let cancel = NSButton(title: "Cancel", target: self, action: #selector(cancelReview))
        cancel.frame = NSRect(x: 24, y: 24, width: 170, height: 32)
        root.view.addSubview(cancel)
        let proceed = NSButton(title: "Review in Photos picker", target: self, action: #selector(openPicker))
        proceed.frame = NSRect(x: 260, y: 24, width: 356, height: 32)
        proceed.isEnabled = false
        root.view.addSubview(proceed)
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = false
        options.deliveryMode = .highQualityFormat
        imageRequest = PHImageManager.default().requestImage(for: asset, targetSize: NSSize(width: 1184, height: 680), contentMode: .aspectFit, options: options) { preview, _ in
            // PhotoKit may invoke this callback off the main thread.
            DispatchQueue.main.async {
                guard self.phase == "review_pending" else { return }
                image.image = preview
                proceed.isEnabled = preview != nil
                detail.stringValue = "\(self.asset.creationDate?.description ?? "Unknown capture date") · \(self.asset.mediaType == .video ? "Video preview only; review full video in Photos" : "Photo preview")\n\(preview == nil ? "Preview unavailable; cancel and resolve in Photos" : "Review this exact asset before continuing")"
            }
        }
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate()
    }

    @objc private func openPicker() {
        guard phase == "review_pending" else { return }
        guard save("picker_review") else { return }
        phase = "picker_review"
        var configuration = PHPickerConfiguration(photoLibrary: .shared())
        configuration.selectionLimit = 2 // Preselection cannot use selectionLimit=1.
        configuration.preselectedAssetIdentifiers = [asset.localIdentifier]
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        present(picker)
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        guard phase == "picker_review" else { return }
        dismiss()
        guard !results.isEmpty else { finish("cancelled_before_posting"); return }
        guard results.count == 1, results[0].assetIdentifier == asset.localIdentifier else {
            finish("selection_changed_review_required"); return
        }
        let confirmation = NSAlert()
        confirmation.messageText = "Continue to Shared Album posting?"
        confirmation.informativeText = "One reviewed asset → \(album.localizedTitle ?? "Shared Album"). The system sheet may change the destination. Press Post only after checking it."
        confirmation.addButton(withTitle: "Continue")
        confirmation.addButton(withTitle: "Cancel")
        guard confirmation.runModal() == .alertFirstButtonReturn else { finish("cancelled_before_posting"); return }
        guard phase == "picker_review", save("posting_outcome_unknown") else { return }
        phase = "posting_outcome_unknown"
        // Real picker results only. Empty preselected item providers require live acceptance.
        let posting = PHSharedAlbumPostingViewController(items: results, defaultAlbumIdentifier: album.localIdentifier, photoLibrary: .shared())
        posting.delegate = self
        present(posting)
    }

    func sharedAlbumPostingViewController(_ controller: PHSharedAlbumPostingViewController, didCompleteWithError error: Error?) {
        guard phase == "posting_outcome_unknown" else { return }
        dismiss()
        guard error == nil else { finish("posting_not_verified", actualAlbum: controller.albumIdentifier); return }
        guard let actual = controller.albumIdentifier else { finish("posting_closed_outcome_unknown"); return }
        finish(actual == album.localIdentifier ? "posting_completed_membership_unverified" : "different_destination_membership_unverified", actualAlbum: actual)
    }

    private func present(_ controller: NSViewController) {
        presented = controller
        root.presentAsSheet(controller)
    }
    private func dismiss() { if let controller = presented { root.dismiss(controller); presented = nil } }
    @objc private func cancelReview() {
        finish(phase == "posting_outcome_unknown" ? "posting_closed_outcome_unknown" : "cancelled_before_posting")
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool { cancelReview(); return false }
    private func finish(_ status: String, actualAlbum: String? = nil) {
        guard phase != "finished" else { return }
        phase = "finished"
        _ = save(status, actualAlbum: actualAlbum)
        if let imageRequest { PHImageManager.default().cancelImageRequest(imageRequest) }
        dismiss()
        window?.orderOut(nil)
        NSApplication.shared.terminate(nil)
    }
    private func save(_ status: String, actualAlbum: String? = nil) -> Bool {
        do { try record(status, actualAlbum: actualAlbum); return true }
        catch {
            phase = "finished"
            let alert = NSAlert()
            alert.messageText = "Operation record unavailable"
            alert.informativeText = "Do not retry posting. Reconcile this operation first."
            alert.runModal()
            NSApplication.shared.terminate(nil)
            return false
        }
    }
    private func record(_ status: String, actualAlbum: String? = nil) throws {
        try journal.record(status, values: actualAlbum.map { ["actualAlbum": $0] } ?? [:])
    }
}
