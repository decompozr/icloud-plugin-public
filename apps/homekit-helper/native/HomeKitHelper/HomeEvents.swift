import Foundation
import HomeKit
import UIKit
import Darwin
import CryptoKit
import CoreFoundation

final class HomeEvents: HomeComponent, HMAccessoryDelegate {
    var events: [[String: Any]] = []
    var sequence = 0
    var subscriptionFailures: [[String: String]] = []
    var subscriptionsPending = 0
    var subscriptionsEnabled = 0
    var eventJournal: URL?
    var eventJournalErrors = 0
    var resourceSubscribers = Set<String>()
    let eventSession = UUID().uuidString

    func subscribe(homeId: String, accessoryIds: Set<String>) {
        for home in homes {
            if home.uniqueIdentifier.uuidString != homeId { continue }
            for accessory in home.accessories {
                if !accessoryIds.contains(accessory.uniqueIdentifier.uuidString) { continue }
                accessory.delegate = self
                for service in accessory.services {
                    for c in service.characteristics where c.properties.contains(HMCharacteristicPropertySupportsEventNotification) {
                        if c.isNotificationEnabled { continue }
                        subscriptionsPending += 1
                        c.enableNotification(true) { error in
                            DispatchQueue.main.async {
                                self.subscriptionsPending -= 1
                                if let error = error {
                                    self.subscriptionFailures.append(["characteristicId": c.uniqueIdentifier.uuidString,
                                        "error": String(describing: error)])
                                } else {
                                    self.subscriptionsEnabled += 1
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    func accessory(_ accessory: HMAccessory, service: HMService, didUpdateValueFor characteristic: HMCharacteristic) {
        // Delegate updates are observed events, not user-visible notification delivery.
        sequence += 1
        let event: [String: Any] = ["session": eventSession, "sequence": sequence, "at": ISO8601DateFormatter().string(from: Date()),
            "homeId": homes.first(where: { $0.accessories.contains(accessory) })?.uniqueIdentifier.uuidString ?? "",
            "accessoryId": accessory.uniqueIdentifier.uuidString, "serviceId": service.uniqueIdentifier.uuidString,
            "characteristicId": characteristic.uniqueIdentifier.uuidString,
            "accessoryName": accessory.name, "room": accessory.room?.name ?? "", "serviceName": service.name,
            "characteristicType": characteristic.characteristicType, "format": characteristic.metadata?.format ?? "",
            "eventType": "characteristic_update", "valueAvailable": characteristic.value != nil,
            "semanticTrust": "provider-value-only",
            "value": scalar(characteristic.value)]
        if let url = eventJournal {
            do {
                var data = try JSONSerialization.data(withJSONObject: event, options: [.sortedKeys])
                data.append(10)
                let file = try FileHandle(forWritingTo: url)
                file.seekToEndOfFile(); file.write(data); file.synchronizeFile(); file.closeFile()
            } catch { eventJournalErrors += 1 }
        }
        events.append(event)
        if events.count > 256 { events.removeFirst(events.count - 256) }
        let signalURI = eventURI(event)
        for uri in resourceSubscribers where uri == "homekit://events/all" || uri == signalURI {
            emit(["jsonrpc": "2.0", "method": "notifications/resources/updated", "params": ["uri": uri]])
        }
    }

    func eventURI(_ event: [String: Any]) -> String {
        "homekit://events/" + ["homeId", "accessoryId", "serviceId", "characteristicId"].map { event[$0] as? String ?? "" }.joined(separator: "/")
    }

    func resourceCatalogue() -> [[String: Any]] {
        var items: [[String: Any]] = [["uri": "homekit://events/all", "name": "All HomeKit events",
            "description": "Observed characteristic callbacks; raw values may be null. No inferred completion or presence.", "mimeType": "application/json"]]
        for home in homes { for a in home.accessories { for s in a.services {
            for c in s.characteristics where c.properties.contains(HMCharacteristicPropertySupportsEventNotification) {
                let uri = eventURI(["homeId": home.uniqueIdentifier.uuidString, "accessoryId": a.uniqueIdentifier.uuidString,
                    "serviceId": s.uniqueIdentifier.uuidString, "characteristicId": c.uniqueIdentifier.uuidString])
                items.append(["uri": uri, "name": "\(a.room?.name ?? home.name)/\(a.name)/\(s.name)/\(c.characteristicType)",
                    "mimeType": "application/json"])
            }
        } } }
        return items
    }

    func resourceAddress(_ uri: String) -> (String, Int)? {
        guard let parts = URLComponents(string: uri), parts.scheme == "homekit", parts.host == "events",
              parts.fragment == nil, parts.user == nil, parts.password == nil, parts.port == nil else { return nil }
        let query = parts.queryItems ?? []
        guard query.count <= 1, query.allSatisfy({ $0.name == "after" }),
              let after = Int(query.first?.value ?? "0"), after >= 0 else { return nil }
        let base = "homekit://events" + parts.path
        guard resourceCatalogue().contains(where: { $0["uri"] as? String == base }) else { return nil }
        return (base, after)
    }

    func resourcePage(uri: String, after: Int) -> [String: Any] {
        // Bound retained replay memory and disk read work. Old cursors receive a gap.
        var bySequence: [Int: [String: Any]] = [:], replayErrors = 0
        var firstAvailable = sequence + 1
        let homes = Set(homes.map { $0.uniqueIdentifier.uuidString })
        func consider(_ event: [String: Any]) {
            guard event["session"] as? String == eventSession, let number = event["sequence"] as? Int else { return }
            firstAvailable = min(firstAvailable, number)
            guard number > after, homes.contains(event["homeId"] as? String ?? ""),
                  uri == "homekit://events/all" || eventURI(event) == uri else { return }
            bySequence[number] = event
            if bySequence.count > 257, let last = bySequence.keys.max() { bySequence.removeValue(forKey: last) }
        }
        if let journal = eventJournal {
            do { replayErrors = try EventReplay.scan(journal, visit: consider) }
            catch { replayErrors += 1 }
        }
        for event in events { consider(event) }
        let matching = bySequence.keys.sorted().compactMap { bySequence[$0] }
        let page = Array(matching.prefix(256))
        return ["session": eventSession, "events": page,
            "cursor": page.last?["sequence"] as? Int ?? after, "headSequence": sequence,
            "hasMore": matching.count > page.count, "gap": replayErrors > 0 || after < firstAvailable - 1,
            "durable": eventJournal != nil && eventJournalErrors == 0 && replayErrors == 0, "journalErrors": eventJournalErrors + replayErrors,
            "semantics": "raw-characteristic-events", "notificationDelivered": false]
    }

    func handleResource(id: Any, method: String, params: [String: Any]) {
        guard runtime.ready && runtime.homeAuthorized else {
            emit(["jsonrpc": "2.0", "id": id, "error": ["code": -32000, "message": "HomeKit not ready or authorized"]]); return
        }
        if method == "resources/list" {
            let offset = Int(params["cursor"] as? String ?? "0") ?? -1
            let items = resourceCatalogue()
            guard offset >= 0 && offset <= items.count else {
                emit(["jsonrpc": "2.0", "id": id, "error": ["code": -32602, "message": "Invalid cursor"]]); return
            }
            let page = Array(items.dropFirst(offset).prefix(100))
            var result: [String: Any] = ["resources": page]
            if offset + page.count < items.count { result["nextCursor"] = String(offset + page.count) }
            emit(["jsonrpc": "2.0", "id": id, "result": result]); return
        }
        guard let uri = params["uri"] as? String, let (base, after) = resourceAddress(uri),
              method == "resources/read" || uri == base else {
            emit(["jsonrpc": "2.0", "id": id, "error": ["code": -32002, "message": "Resource not found"]]); return
        }
        switch method {
        case "resources/subscribe":
            resourceSubscribers.insert(base)
            for home in homes {
                let ids = home.accessories.filter { a in
                    base == "homekit://events/all" || base.contains("/\(home.uniqueIdentifier.uuidString)/\(a.uniqueIdentifier.uuidString)/")
                }.map { $0.uniqueIdentifier.uuidString }
                subscribe(homeId: home.uniqueIdentifier.uuidString, accessoryIds: Set(ids))
            }
            emit(["jsonrpc": "2.0", "id": id, "result": [:]])
        case "resources/unsubscribe":
            resourceSubscribers.remove(base)
            emit(["jsonrpc": "2.0", "id": id, "result": [:]])
        case "resources/read":
            let data = (try? JSONSerialization.data(withJSONObject: resourcePage(uri: base, after: after), options: [.sortedKeys])) ?? Data()
            emit(["jsonrpc": "2.0", "id": id, "result": ["contents": [["uri": uri, "mimeType": "application/json",
                "text": String(data: data, encoding: .utf8) ?? "{}"]]]])
        default: break
        }
    }

}
