import Foundation
import Photos
import AppKit

struct Failure: Error { let code: String }
func fail(_ code: String) throws -> Never { throw Failure(code: code) }
func uuid(_ id: String) -> String { String(id.split(separator: ":").last ?? "") }
func items<T: PHObject>(_ result: PHFetchResult<T>) -> [T] { var all: [T] = []; result.enumerateObjects { p, _, _ in all.append(p) }; return all }
func fetchAssets(_ ids: [String]) throws -> [PHAsset] {
    let found = items(PHAsset.fetchAssets(withLocalIdentifiers: ids.map { uuid($0) + "/L0/001" }, options: nil))
    if found.count != ids.count { try fail("asset_not_found") }
    return found
}
func fetchAlbum(_ id: String) throws -> PHAssetCollection {
    // Resolve actual localIdentifier from the UUID, without assuming its suffix.
    let target = uuid(id)
    let all = items(PHAssetCollection.fetchAssetCollections(with: .album, subtype: .any, options: nil))
    let found = all.filter { String($0.localIdentifier.split(separator: "/")[0]) == target }
    guard found.count == 1 else { try fail("native_album_unavailable") }
    return found[0]
}
func run(_ input: [String: Any]) throws -> [String: Any] {
    let command = input["command"] as? String ?? ""
    if command == "shared_review" { try fail("remote_shared_album_posting_unavailable") }
    if command == "authorize" {
        let completed = DispatchSemaphore(value: 0)
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { _ in completed.signal() }
        while completed.wait(timeout: .now()) == .timedOut { RunLoop.current.run(until: Date(timeIntervalSinceNow: 0.05)) }
    }
    let status = PHPhotoLibrary.authorizationStatus(for: .readWrite)
    if command == "authorize" || command == "health" { return ["authorization": status.rawValue, "authorized": status == .authorized] }
    guard status == .authorized else { try fail("photos_native_permission_required") }
    guard let mutation = input["mutation"] as? [String: Any], let action = mutation["action"] as? String else { try fail("invalid_request") }
    let ids = mutation["assetIds"] as? [String] ?? []
    let assets = try fetchAssets(ids)
    let album = try (mutation["albumId"] as? String).map { try fetchAlbum($0) }
    let isShared = (mutation["albumId"] as? String)?.contains(":shared:") ?? false
    if action == "post_to_shared_album" || isShared || album?.assetCollectionSubtype == .albumCloudShared { try fail("shared_album_write_unsupported") }
    // Never substitute an ordinary album if a Shared Album cannot be resolved.
    if let album = album {
        if isShared && album.assetCollectionSubtype != .albumCloudShared { try fail("shared_album_write_unsupported") }
        let operation: PHCollectionEditOperation
        switch action {
        case "add_to_album": operation = .addContent
        case "remove_from_album": operation = .removeContent
        case "rename_album": operation = .rename
        case "delete_empty_album": operation = .delete
        default: try fail("unsupported_action")
        }
        if !album.canPerform(operation) { try fail(isShared ? "shared_album_write_unsupported" : "album_write_unsupported") }
        if action == "delete_empty_album" && PHAsset.fetchAssets(in: album, options: nil).count != 0 { try fail("album_not_empty") }
    }
    if action == "delete_assets" && !assets.allSatisfy({ $0.canPerform(.delete) }) { try fail("asset_delete_unsupported") }
    if action == "set_metadata" && !assets.allSatisfy({ $0.canPerform(.properties) }) { try fail("asset_write_unsupported") }
    if command == "probe" { return ["supported": true, "shared": isShared, "serverSyncVerified": false] }
    guard command == "apply" else { try fail("invalid_request") }
    var created: String?
    try PHPhotoLibrary.shared().performChangesAndWait {
        switch action {
        case "create_album": created = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: mutation["title"] as! String).placeholderForCreatedAssetCollection.localIdentifier
        case "rename_album": PHAssetCollectionChangeRequest(for: album!)?.title = mutation["title"] as! String
        case "delete_empty_album": PHAssetCollectionChangeRequest.deleteAssetCollections([album!] as NSArray)
        case "add_to_album": PHAssetCollectionChangeRequest(for: album!)?.addAssets(assets as NSArray)
        case "remove_from_album": PHAssetCollectionChangeRequest(for: album!)?.removeAssets(assets as NSArray)
        case "delete_assets": PHAssetChangeRequest.deleteAssets(assets as NSArray)
        case "set_metadata":
            if let values = mutation["values"] as? [String: Any], let favorite = values["favorite"] as? Bool {
                for asset in assets { PHAssetChangeRequest(for: asset).isFavorite = favorite }
            }
        default: break
        }
    }
    // Read back native state. A committed local edit is not cloud upload completion.
    var verified = false
    switch action {
    case "create_album": verified = created.map { PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [$0], options: nil).count == 1 } ?? false
    case "delete_assets": verified = PHAsset.fetchAssets(withLocalIdentifiers: assets.map(\.localIdentifier), options: nil).count == 0
    case "delete_empty_album": verified = PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [album!.localIdentifier], options: nil).count == 0
    case "rename_album": verified = PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [album!.localIdentifier], options: nil).firstObject?.localizedTitle == mutation["title"] as? String
    case "add_to_album", "remove_from_album":
        let members = Set(items(PHAsset.fetchAssets(in: album!, options: nil)).map(\.localIdentifier))
        verified = assets.allSatisfy { action == "add_to_album" ? members.contains($0.localIdentifier) : !members.contains($0.localIdentifier) }
    case "set_metadata":
        let favorite = (mutation["values"] as? [String: Any])?["favorite"] as? Bool
        verified = try fetchAssets(ids).allSatisfy { $0.isFavorite == favorite }
    default: break
    }
    var result: [String: Any] = ["status": verified ? "applied" : "outcome_unknown", "localReadbackVerified": verified, "serverSyncVerified": false]
    if let created = created { result["createdUuid"] = String(created.split(separator: "/")[0]) }
    return result
}
@main
struct PhotosHelperMain {
@MainActor static func main() {
do {
    if CommandLine.arguments.contains("--authorize") { _ = NSApplication.shared }
    let data = CommandLine.arguments.contains("--authorize") ? Data("{\"command\":\"authorize\"}".utf8) : FileHandle.standardInput.readDataToEndOfFile()
    guard data.count <= 65536, let input = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { try fail("invalid_request") }
    let output = try run(input)
    print(String(data: try JSONSerialization.data(withJSONObject: ["ok": true, "result": output], options: [.sortedKeys]), encoding: .utf8)!)
    fflush(stdout)
} catch {
    let code = (error as? Failure)?.code ?? "native_operation_failed"
    print(String(data: try! JSONSerialization.data(withJSONObject: ["ok": false, "error": code]), encoding: .utf8)!)
}
}
}
