import AppKit
import Photos

@MainActor
final class ReviewCatalog: NSObject, NSWindowDelegate {
    private let entries: [[String: Any]]
    private let journal: ReviewJournal
    private let root = NSViewController()
    private var window: NSWindow!
    private var selections: [NSButton] = []
    private var requests: [PHImageRequestID] = []
    private var finished = false
    init(input: [String: Any]) throws {
        guard PHPhotoLibrary.authorizationStatus(for: .readWrite) == .authorized else { try fail("photos_native_permission_required") }
        guard let entries = input["entries"] as? [[String: Any]], !entries.isEmpty, entries.count <= 12,
              let id = input["operationId"] as? String, let directory = input["reviewDirectory"] as? String,
              entries.allSatisfy({ ($0["assetId"] as? String) != nil && ($0["reason"] as? String) != nil }) else { try fail("invalid_request") }
        self.entries = entries
        journal = try ReviewJournal(directory: directory, operationId: id)
        super.init()
        try journal.record("catalog_review")
    }
    func show() throws {
        root.view = NSView(frame: NSRect(x: 0, y: 0, width: 880, height: 720))
        window = NSWindow(contentRect: root.view.frame, styleMask: [.titled, .closable, .miniaturizable], backing: .buffered, defer: false)
        window.title = "Photos review / 照片審閱"
        window.contentViewController = root
        window.isReleasedWhenClosed = false
        window.delegate = self
        let header = NSTextField(wrappingLabelWithString: "Select exact assets for further review. This window never uploads or deletes. Probable matches and messaging filenames are clues; age alone does not mean disposable.\n選取需要下一步審閱的照片。此視窗不會上傳或刪除。可能相符與通訊軟體檔名僅是線索；照片較舊不代表可以刪除。")
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
            let select = NSButton(checkboxWithTitle: "Select / 選取", target: nil, action: nil)
            select.identifier = NSUserInterfaceItemIdentifier(assetId)
            select.frame = NSRect(x: 8, y: y + 266, width: 160, height: 25)
            select.isEnabled = false
            document.addSubview(select)
            selections.append(select)
            let reason = entry["reason"] as! String
            let reasons = ["confirmed": "Same asset identity / 同一照片識別碼", "probable": "Probable copy, unverified / 可能副本，尚未確認", "ambiguous": "Multiple candidates / 多個候選副本", "not_found": "No local candidate / 本機未找到候選副本", "same_fingerprint": "Matching fingerprint, review required / 指紋相符，需審閱", "screenshot": "Screenshot; value/expiry undecided / 截圖，價值與時效待判斷", "messaging_filename": "Messaging filename signal only / 僅通訊軟體檔名線索"]
            let motion = asset.mediaType == .video || asset.mediaSubtypes.contains(.photoLive)
            let text = NSTextField(wrappingLabelWithString: "\(entry["filename"] as? String ?? "Photo") · \(reasons[reason] ?? reason)\(asset.isFavorite ? " · Favorite / 喜好項目" : "")\n\(entry["date"] as? String ?? "Unknown capture date")\n\(motion ? "Motion thumbnail only; inspect full video/Live Photo in Photos / 動態縮圖，請在 Photos 檢查完整影片或原況照片" : "Source at left; candidate copies at right / 左側原照片；右側候選副本")")
            text.frame = NSRect(x: 180, y: y + 230, width: 620, height: 65)
            document.addSubview(text)
            preview(asset, in: document, frame: NSRect(x: 8, y: y + 8, width: 260, height: 216), selection: select)
            for (candidateIndex, candidate) in (entry["candidateIds"] as? [String] ?? []).prefix(2).enumerated() {
                if let copy = try? fetchAssets([candidate]).first {
                    preview(copy, in: document, frame: NSRect(x: 278 + candidateIndex * 265, y: Int(y) + 8, width: 255, height: 216), selection: nil)
                } else {
                    let missing = NSTextField(wrappingLabelWithString: "Candidate unavailable in native library / 原生照片庫無法取得候選副本")
                    missing.frame = NSRect(x: 278 + candidateIndex * 265, y: Int(y) + 8, width: 255, height: 216)
                    document.addSubview(missing)
                }
            }
        }
        scroll.contentView.scroll(to: NSPoint(x: 0, y: document.frame.height - scroll.contentSize.height))
        scroll.reflectScrolledClipView(scroll.contentView)
        let cancel = NSButton(title: "Cancel / 取消", target: self, action: #selector(cancelReview))
        cancel.frame = NSRect(x: 24, y: 24, width: 180, height: 32)
        root.view.addSubview(cancel)
        let save = NSButton(title: "Save selection only / 僅儲存選取", target: self, action: #selector(saveSelection))
        save.frame = NSRect(x: 550, y: 24, width: 306, height: 32)
        root.view.addSubview(save)
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate()
    }
    private func preview(_ asset: PHAsset, in view: NSView, frame: NSRect, selection: NSButton?) {
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
                    let missing = NSTextField(wrappingLabelWithString: "Preview unavailable / 預覽不可用")
                    missing.frame = frame
                    view.addSubview(missing)
                }
            }
        })
    }
    @objc private func saveSelection() {
        let ids = selections.filter { $0.state == .on && $0.isEnabled }.compactMap { $0.identifier?.rawValue }
        finish("selection_reviewed", ids: ids)
    }
    @objc private func cancelReview() { finish("catalog_cancelled", ids: []) }
    func windowShouldClose(_ sender: NSWindow) -> Bool { cancelReview(); return false }
    private func finish(_ status: String, ids: [String]) {
        guard !finished else { return }
        finished = true
        do { try journal.record(status, values: ["selectedAssetIds": ids]) }
        catch { let alert = NSAlert(); alert.messageText = "Selection could not be saved / 無法儲存選取"; alert.runModal() }
        for request in requests { PHImageManager.default().cancelImageRequest(request) }
        window.orderOut(nil)
        NSApplication.shared.terminate(nil)
    }
}

@MainActor
final class PhotosPermissionWindow: NSObject, NSWindowDelegate {
    private var window: NSWindow!
    private let status = NSTextField(wrappingLabelWithString: "")
    func show() {
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 620, height: 350), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "Photos setup / 照片設定"
        window.delegate = self
        window.isReleasedWhenClosed = false
        status.frame = NSRect(x: 24, y: 240, width: 572, height: 80)
        window.contentView!.addSubview(status)
        let titles = ["Request Photos Access / 要求照片存取", "Open Photos Privacy / 照片隱私設定", "Open Full Disk Access / 完整磁碟存取設定", "Check Again / 重新檢查"]
        let actions = [#selector(authorize), #selector(photosSettings), #selector(filesSettings), #selector(recheck)]
        for index in 0..<titles.count {
            let button = NSButton(title: titles[index], target: self, action: actions[index])
            button.frame = NSRect(x: 24, y: 190 - index * 45, width: 572, height: 32)
            window.contentView!.addSubview(button)
        }
        recheck()
        window.center(); window.makeKeyAndOrderFront(nil)
        NSApplication.shared.activate()
    }
    @objc private func recheck() {
        let value = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        let messages: [PHAuthorizationStatus: String] = [
            .notDetermined: "Access has not been requested. Press Request Photos Access and choose Full Access. / 尚未要求存取。請按要求照片存取並選擇完整存取。",
            .denied: "Access is denied. Open Photos Privacy to allow Full Access, then recheck. / 存取遭拒。請在照片隱私設定允許完整存取，再重新檢查。",
            .restricted: "Photos access is restricted by system policy. / 照片存取受到系統政策限制。",
            .limited: "Limited access is insufficient. Choose Full Access in Photos Privacy, then recheck. / 有限存取不足，請在照片隱私設定選擇完整存取後重新檢查。"
        ]
        status.stringValue = value == .authorized ? "Photos access is ready. Close this window to continue. / 照片存取已就緒，關閉此視窗後繼續。" : (messages[value] ?? "Photos access is unavailable. / 照片存取不可用。")
    }
    @objc private func authorize() { PHPhotoLibrary.requestAuthorization(for: .readWrite) { _ in DispatchQueue.main.async { self.recheck() } } }
    @objc private func photosSettings() { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Photos")!) }
    @objc private func filesSettings() { NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")!) }
    func windowShouldClose(_ sender: NSWindow) -> Bool { NSApplication.shared.terminate(nil); return false }
}
