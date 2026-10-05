import AppKit
import Photos

@MainActor
final class ReviewCatalog: NSObject, NSWindowDelegate {
    private let entries: [[String: Any]]
    private let journal: ReviewJournal
    private let root = NSViewController()
    private var window: NSWindow!
    private var selections: [NSPopUpButton] = []
    private let kind: String
    private var requests: [PHImageRequestID] = []
    private var finished = false
    init(input: [String: Any]) throws {
        guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else { try fail("photos_native_permission_required") }
        guard let entries = input["entries"] as? [[String: Any]], !entries.isEmpty, entries.count <= 12,
              let id = input["operationId"] as? String, let directory = input["reviewDirectory"] as? String,
              entries.allSatisfy({ ($0["assetId"] as? String) != nil && ($0["reason"] as? String) != nil }) else { try fail("invalid_request") }
        guard let kind = input["kind"] as? String, ["comparison", "cleanup"].contains(kind) else { try fail("invalid_request") }
        self.kind = kind
        self.entries = entries
        journal = try ReviewJournal(directory: directory, operationId: id)
        super.init()
        try journal.record("catalog_review")
    }
    func show() throws {
        root.view = NSView(frame: NSRect(x: 0, y: 0, width: 880, height: 720))
        window = NSWindow(contentRect: root.view.frame, styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Photos review"
        window.contentViewController = root
        window.isReleasedWhenClosed = false
        window.delegate = self
        let header = NSTextField(wrappingLabelWithString: "Record a decision for each photo. Keep and undecided are preserved; sharing/deletion need a separate final review. This window never uploads or deletes. Probable matches and messaging filenames are clues; age alone does not mean disposable.")
        header.frame = NSRect(x: 24, y: 625, width: 832, height: 70)
        root.view.addSubview(header)
        let scroll = NSScrollView(frame: NSRect(x: 24, y: 80, width: 832, height: 535))
        scroll.hasVerticalScroller = true
        let document = NSView(frame: NSRect(x: 0, y: 0, width: 810, height: CGFloat(entries.count * 300)))
        scroll.documentView = document
        root.view.addSubview(scroll)
        for (index, entry) in entries.enumerated() {
            let assetId = entry["assetId"] as! String
            let asset = try fetchAssets([assetId])[0]
            let y = CGFloat((entries.count - index - 1) * 300)
            let select = NSPopUpButton(frame: .zero, pullsDown: false)
            select.addItems(withTitles: ["Undecided", "Keep", kind == "comparison" ? "Review sharing" : "Review deletion"])
            select.identifier = NSUserInterfaceItemIdentifier(assetId)
            select.frame = NSRect(x: 8, y: y + 266, width: 240, height: 25)
            select.isEnabled = false
            document.addSubview(select)
            selections.append(select)
            let reason = entry["reason"] as! String
            let reasons = ["confirmed": "Same asset identity", "probable": "Probable copy, unverified", "ambiguous": "Multiple candidates", "not_found": "No local candidate", "same_fingerprint": "Matching fingerprint, review required", "screenshot": "Screenshot; value/expiry undecided", "messaging_filename": "Messaging filename signal only"]
            let motion = asset.mediaType == .video || asset.mediaSubtypes.contains(.photoLive)
            let text = NSTextField(wrappingLabelWithString: "\(entry["filename"] as? String ?? "Photo") · \(reasons[reason] ?? reason)\(asset.isFavorite ? " · Favorite" : "")\n\(entry["date"] as? String ?? "Unknown capture date")\n\(motion ? "Motion thumbnail only; inspect full video/Live Photo in Photos" : "Source at left; candidate copies at right")")
            text.frame = NSRect(x: 260, y: y + 230, width: 540, height: 65)
            document.addSubview(text)
            preview(asset, in: document, frame: NSRect(x: 8, y: y + 8, width: 260, height: 216), selection: select)
            for (candidateIndex, candidate) in (entry["candidateIds"] as? [String] ?? []).prefix(2).enumerated() {
                if let copy = try? fetchAssets([candidate]).first {
                    preview(copy, in: document, frame: NSRect(x: 278 + candidateIndex * 265, y: Int(y) + 8, width: 255, height: 216), selection: nil)
                } else {
                    let missing = NSTextField(wrappingLabelWithString: "Candidate unavailable in native library")
                    missing.frame = NSRect(x: 278 + candidateIndex * 265, y: Int(y) + 8, width: 255, height: 216)
                    document.addSubview(missing)
                }
            }
        }
        scroll.contentView.scroll(to: NSPoint(x: 0, y: document.frame.height - scroll.contentSize.height))
        scroll.reflectScrolledClipView(scroll.contentView)
        let cancel = NSButton(title: "Cancel", target: self, action: #selector(cancelReview))
        cancel.frame = NSRect(x: 24, y: 24, width: 180, height: 32)
        root.view.addSubview(cancel)
        let save = NSButton(title: "Save decisions", target: self, action: #selector(saveSelection))
        save.frame = NSRect(x: 550, y: 24, width: 306, height: 32)
        root.view.addSubview(save)
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate()
    }
    private func preview(_ asset: PHAsset, in view: NSView, frame: NSRect, selection: NSPopUpButton?) {
        let image = NSImageView(frame: frame)
        image.imageScaling = .scaleProportionallyUpOrDown
        view.addSubview(image)
        let options = PHImageRequestOptions()
        options.isNetworkAccessAllowed = false
        options.deliveryMode = .highQualityFormat
        requests.append(PHImageManager.default().requestImage(for: asset, targetSize: NSSize(width: 520, height: 432), contentMode: .aspectFit, options: options) { bitmap, _ in
            DispatchQueue.main.async {
                guard !self.finished else { return }
                image.image = bitmap
                selection?.isEnabled = bitmap != nil
                if bitmap == nil {
                    let missing = NSTextField(wrappingLabelWithString: "Preview unavailable")
                    missing.frame = frame
                    view.addSubview(missing)
                }
            }
        })
    }
    @objc private func saveSelection() {
        let decisions: [[String: String]] = selections.compactMap { control in
            guard let id = control.identifier?.rawValue else { return nil }
            let value = !control.isEnabled || control.indexOfSelectedItem == 0 ? "undecided" : control.indexOfSelectedItem == 1 ? "keep" : kind == "comparison" ? "share_review" : "delete_review"
            return ["assetId": id, "decision": value]
        }
        let ids = decisions.filter { ["share_review", "delete_review"].contains($0["decision"]!) }.compactMap { $0["assetId"] }
        finish("selection_reviewed", ids: ids, decisions: decisions)
    }
    @objc private func cancelReview() { finish("catalog_cancelled", ids: []) }
    func windowShouldClose(_ sender: NSWindow) -> Bool { cancelReview(); return false }
    private func finish(_ status: String, ids: [String], decisions: [[String: String]]? = nil) {
        guard !finished else { return }
        finished = true
        var values: [String: Any] = ["selectedAssetIds": ids]
        if let decisions { values["decisions"] = decisions }
        do { try journal.record(status, values: values) }
        catch { let alert = NSAlert(); alert.messageText = "Selection could not be saved"; alert.runModal() }
        for request in requests { PHImageManager.default().cancelImageRequest(request) }
        window.orderOut(nil)
        NSApplication.shared.terminate(nil)
    }
}
