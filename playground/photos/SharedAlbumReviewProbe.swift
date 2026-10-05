// Compile-only macOS 27 API experiment. Not wired into the production helper.
// No window is opened and no upload occurs when this file is typechecked.
import AppKit
import Photos
import PhotosUI
import Darwin

@available(macOS 27.0, *)
@MainActor
final class SharedAlbumReviewProbe: NSObject, PHPickerViewControllerDelegate,
    @MainActor PHSharedAlbumPostingViewController.Delegate {
    let library = PHPhotoLibrary.shared()
    let expectedAssets: Set<String>
    let targetAlbum: String
    let present: (NSViewController) -> Void
    let completion: (String, String?) -> Void
    let dismiss: (NSViewController) -> Void
    let operationID: UUID
    let journalDirectory: URL
    private var journal: Int32 = -1
    private var phase = "not_started"

    init(assetIdentifiers: [String], albumIdentifier: String,
         operationID: UUID, journalDirectory: URL,
         present: @escaping (NSViewController) -> Void,
         dismiss: @escaping (NSViewController) -> Void,
         completion: @escaping (String, String?) -> Void) {
        expectedAssets = Set(assetIdentifiers)
        targetAlbum = albumIdentifier
        self.present = present
        self.completion = completion
        self.dismiss = dismiss
        self.operationID = operationID
        self.journalDirectory = journalDirectory
    }

    // The host must retain this delegate, launch through its authorized app,
    // and call abandon() on window close. This probe never launches itself.
    // A concrete, owner-reviewed single asset is required; no bulk experiment.
    func start() throws {
        guard phase == "not_started", expectedAssets.count == 1,
              PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized,
              PHAsset.fetchAssets(withLocalIdentifiers: expectedAssets.sorted(), options: nil).count == 1,
              let album = PHAssetCollection.fetchAssetCollections(
                withLocalIdentifiers: [targetAlbum], options: nil).firstObject,
              album.assetCollectionSubtype == .albumCloudShared else {
            throw ProbeError.invalidReview
        }
        let attributes = try FileManager.default.attributesOfItem(atPath: journalDirectory.path)
        guard attributes[.type] as? FileAttributeType == .typeDirectory,
              (attributes[.posixPermissions] as? NSNumber)?.intValue == 0o700,
              (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid() else {
            throw ProbeError.privateDirectoryRequired
        }
        let path = journalDirectory.appendingPathComponent(operationID.uuidString + ".jsonl").path
        phase = "initializing"
        journal = open(path, O_WRONLY | O_CREAT | O_EXCL | O_APPEND | O_NOFOLLOW, 0o600)
        guard journal >= 0 else { throw ProbeError.existingOrUnavailableOperation }
        // Durable identity precedes any UI. Existing IDs can never be retried.
        try record("picker_review")
        phase = "picker_review"
        present(picker())
    }

    private func picker() -> PHPickerViewController {
        var configuration = PHPickerConfiguration(photoLibrary: library)
        // Preselection is unsupported when selectionLimit == 1.
        configuration.selectionLimit = max(2, expectedAssets.count)
        configuration.preselectedAssetIdentifiers = expectedAssets.sorted()
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        return picker
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        guard phase == "picker_review" else { return }
        dismiss(picker)
        guard !results.isEmpty else { finish("cancelled_before_posting", nil); return }
        let identifiers = results.compactMap(\.assetIdentifier)
        guard identifiers.count == results.count,
              identifiers.count == expectedAssets.count,
              Set(identifiers) == expectedAssets else {
            finish("selection_changed_review_required", nil)
            return
        }
        let review = NSAlert()
        review.messageText = "Review Shared Album posting"
        let album = PHAssetCollection.fetchAssetCollections(
            withLocalIdentifiers: [targetAlbum], options: nil).firstObject
        review.informativeText = "Post the one reviewed photo to \(album?.localizedTitle ?? "selected Shared Album")? Family members may see it. The next system sheet can change the destination; verify it before pressing Post."
        review.addButton(withTitle: "Continue to posting sheet")
        review.addButton(withTitle: "Cancel")
        guard review.runModal() == .alertFirstButtonReturn else {
            finish("cancelled_before_posting", nil); return
        }
        guard phase == "picker_review" else { return }
        // Closing/crashing after this record requires reconciliation, not retry.
        do { try record("posting_outcome_unknown") }
        catch { finish("journal_failed_no_posting", nil); return }
        phase = "posting_outcome_unknown"
        // Use real picker results. PHPickerResult has no public constructor;
        // preselected results have empty item providers, requiring live validation.
        let posting = PHSharedAlbumPostingViewController(
            items: results, defaultAlbumIdentifier: targetAlbum, photoLibrary: library)
        posting.delegate = self
        present(posting)
    }

    func sharedAlbumPostingViewController(_ postingViewController: PHSharedAlbumPostingViewController,
                                          didCompleteWithError error: Error?) {
        // The UI allows changing destination. Never claim the requested album
        // received the photos based only on successful presentation/completion.
        guard phase == "posting_outcome_unknown" else { return }
        dismiss(postingViewController)
        guard error == nil else { finish("posting_not_verified", postingViewController.albumIdentifier); return }
        guard let actualAlbum = postingViewController.albumIdentifier else {
            finish("posting_outcome_unknown", nil); return
        }
        finish(actualAlbum == targetAlbum
            ? "posting_completed_membership_unverified"
            : "different_destination_membership_unverified",
            actualAlbum)
    }

    func abandon() {
        guard phase == "picker_review" || phase == "posting_outcome_unknown" else { return }
        finish(phase == "picker_review" ? "cancelled_before_posting" : "posting_outcome_unknown", nil)
    }

    private func finish(_ status: String, _ album: String?) {
        phase = "finished"
        do { try record(status, actualAlbum: album) }
        catch { completion("journal_failed_reconcile_operation", album); return }
        completion(status, album)
    }

    private func record(_ status: String, actualAlbum: String? = nil) throws {
        var event: [String: Any] = ["operationID": operationID.uuidString,
            "status": status, "expectedAssets": expectedAssets.sorted(),
            "expectedAlbum": targetAlbum, "timestamp": Date().timeIntervalSince1970,
            "localReadbackVerified": false, "serverSyncVerified": false]
        if let actualAlbum { event["actualAlbum"] = actualAlbum }
        var data = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys])
        data.append(0x0A)
        try data.withUnsafeBytes { bytes in
            var offset = 0
            while offset < bytes.count {
                let count = Darwin.write(journal, bytes.baseAddress!.advanced(by: offset), bytes.count - offset)
                if count < 0 && errno == EINTR { continue }
                guard count > 0 else { throw ProbeError.journalFailure }
                offset += count
            }
        }
        guard fsync(journal) == 0 else { throw ProbeError.journalFailure }
    }

    enum ProbeError: Error {
        case invalidReview, privateDirectoryRequired, existingOrUnavailableOperation, journalFailure
    }

    deinit { if journal >= 0 { close(journal) } }
}
