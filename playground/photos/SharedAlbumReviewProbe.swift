// Compile-only macOS 27 API experiment. Not wired into the production helper.
// No window is opened and no upload occurs when this file is typechecked.
import AppKit
import Photos
import PhotosUI

@available(macOS 27.0, *)
@MainActor
final class SharedAlbumReviewProbe: NSObject, PHPickerViewControllerDelegate,
    @MainActor PHSharedAlbumPostingViewController.Delegate {
    let library = PHPhotoLibrary.shared()
    let expectedAssets: Set<String>
    let targetAlbum: String
    let present: (NSViewController) -> Void
    let completion: (String, String?) -> Void

    init(assetIdentifiers: [String], albumIdentifier: String,
         present: @escaping (NSViewController) -> Void,
         completion: @escaping (String, String?) -> Void) {
        expectedAssets = Set(assetIdentifiers)
        targetAlbum = albumIdentifier
        self.present = present
        self.completion = completion
    }

    func picker() -> PHPickerViewController {
        var configuration = PHPickerConfiguration(photoLibrary: library)
        // Preselection is unsupported when selectionLimit == 1.
        configuration.selectionLimit = max(2, expectedAssets.count)
        configuration.preselectedAssetIdentifiers = expectedAssets.sorted()
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = self
        return picker
    }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        guard !results.isEmpty else { completion("cancelled", nil); return }
        let identifiers = results.compactMap(\.assetIdentifier)
        guard identifiers.count == results.count,
              Set(identifiers) == expectedAssets else {
            completion("selection_changed_review_required", nil)
            return
        }
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
        guard error == nil else { completion("posting_not_verified", nil); return }
        completion(postingViewController.albumIdentifier == targetAlbum
            ? "posting_completed_membership_unverified"
            : "different_destination_membership_unverified",
            postingViewController.albumIdentifier)
    }
}
