import Foundation
import HomeKit
import UIKit
import Darwin
import CryptoKit
import CoreFoundation

final class HomeCatalog: HomeComponent {
    func inventory(query: String? = nil) -> [String: Any] {
        let homes: [[String: Any]] = homes.map { home in
            let accessories: [[String: Any]] = home.accessories.compactMap { accessory in
                if let query = query, !query.isEmpty,
                   ![accessory.name, accessory.room?.name ?? "", home.name]
                    .joined(separator: " ").localizedCaseInsensitiveContains(query) { return nil }
                let services: [[String: Any]] = accessory.services.map { service in
                    let characteristics: [[String: Any]] = service.characteristics.map { c in
                        ["id": c.uniqueIdentifier.uuidString, "type": c.characteristicType,
                         "properties": c.properties, "value": scalar(c.value), "valueSource": "cached",
                         "format": c.metadata?.format ?? "", "units": c.metadata?.units ?? "",
                         "minimum": scalar(c.metadata?.minimumValue), "maximum": scalar(c.metadata?.maximumValue),
                         "step": scalar(c.metadata?.stepValue), "maxLength": scalar(c.metadata?.maxLength),
                         "validValues": c.metadata?.validValues ?? [],
                         "writable": c.properties.contains(HMCharacteristicPropertyWritable),
                         "controlValueSupported": ControlValue.formats.contains(c.metadata?.format ?? ""),
                         "notificationsEnabled": c.isNotificationEnabled]
                    }
                    return ["id": service.uniqueIdentifier.uuidString, "name": service.name,
                            "type": service.serviceType, "characteristics": characteristics]
                }
                return ["id": accessory.uniqueIdentifier.uuidString, "name": accessory.name,
                        "roomId": accessory.room?.uniqueIdentifier.uuidString ?? "",
                        "room": accessory.room?.name ?? "", "reachable": accessory.isReachable,
                        "services": services]
            }
            return ["id": home.uniqueIdentifier.uuidString, "name": home.name,
                    "rooms": home.rooms.map { ["id": $0.uniqueIdentifier.uuidString, "name": $0.name] },
                    "zones": home.zones.map { zone in ["id": zone.uniqueIdentifier.uuidString,
                        "name": zone.name, "roomIds": zone.rooms.map { $0.uniqueIdentifier.uuidString }] as [String: Any] },
                    "accessories": accessories,
                    "scenes": home.actionSets.map { ["id": $0.uniqueIdentifier.uuidString,
                        "name": $0.name, "actionCount": $0.actions.count] as [String: Any] },
                    "automations": home.triggers.map { ["id": $0.uniqueIdentifier.uuidString,
                        "name": $0.name, "enabled": $0.isEnabled,
                        "type": String(describing: type(of: $0)),
                        "sceneIds": $0.actionSets.map { $0.uniqueIdentifier.uuidString }] as [String: Any] }]
        }
        return ["status": runtime.status(), "homes": homes, "valuesAreFresh": false]
    }


    // Provider object snapshot, not a fresh device read or complete Home app definition.
    func dateComponents(_ value: DateComponents?) -> Any {
        guard let value = value else { return NSNull() }
        var result: [String: Any] = [:]
        for (key, component) in [("era", value.era), ("year", value.year), ("month", value.month),
            ("day", value.day), ("hour", value.hour), ("minute", value.minute), ("second", value.second),
            ("nanosecond", value.nanosecond), ("weekday", value.weekday), ("weekdayOrdinal", value.weekdayOrdinal),
            ("quarter", value.quarter), ("weekOfMonth", value.weekOfMonth), ("weekOfYear", value.weekOfYear),
            ("yearForWeekOfYear", value.yearForWeekOfYear)] {
            if let component = component { result[key] = component }
        }
        result["calendar"] = value.calendar.map { String(describing: $0.identifier) } ?? NSNull()
        result["timeZone"] = value.timeZone?.identifier ?? NSNull()
        result["isLeapMonth"] = value.isLeapMonth.map { $0 as Any } ?? NSNull()
        return result
    }

    func reference(_ c: HMCharacteristic, home: HMHome) -> [String: Any] {
        for accessory in home.accessories {
            for service in accessory.services where service.characteristics.contains(where: { $0.uniqueIdentifier == c.uniqueIdentifier }) {
                return ["homeId": home.uniqueIdentifier.uuidString, "accessoryId": accessory.uniqueIdentifier.uuidString,
                    "serviceId": service.uniqueIdentifier.uuidString, "characteristicId": c.uniqueIdentifier.uuidString,
                    "resolved": true, "format": c.metadata?.format ?? NSNull()]
            }
        }
        return ["homeId": home.uniqueIdentifier.uuidString, "characteristicId": c.uniqueIdentifier.uuidString,
            "resolved": false, "reason": "CHARACTERISTIC_NOT_IN_HOME"]
    }

    func eventDetail(_ event: HMEvent, home: HMHome) -> [String: Any] {
        var result: [String: Any] = ["id": event.uniqueIdentifier.uuidString,
            "providerType": String(describing: type(of: event)), "kind": "opaque", "opaque": true]
        if let e = event as? HMCharacteristicEvent<NSCopying> {
            result.merge(["kind": "characteristic", "opaque": false, "target": reference(e.characteristic, home: home),
                "triggerValue": scalar(e.triggerValue)], uniquingKeysWith: { _, new in new })
        } else if let e = event as? HMCharacteristicThresholdRangeEvent {
            result.merge(["kind": "threshold", "opaque": false, "target": reference(e.characteristic, home: home),
                "minimum": scalar(e.thresholdRange.minValue), "maximum": scalar(e.thresholdRange.maxValue)], uniquingKeysWith: { _, new in new })
        } else if let e = event as? HMCalendarEvent {
            result.merge(["kind": "calendar", "opaque": false, "components": dateComponents(e.fireDateComponents)], uniquingKeysWith: { _, new in new })
        } else if let e = event as? HMSignificantTimeEvent {
            result.merge(["kind": "significantTime", "opaque": false, "significantEvent": e.significantEvent,
                "offset": dateComponents(e.offset)], uniquingKeysWith: { _, new in new })
        } else if let e = event as? HMDurationEvent {
            result.merge(["kind": "duration", "opaque": false, "duration": e.duration], uniquingKeysWith: { _, new in new })
        } else if let e = event as? HMPresenceEvent {
            result.merge(["kind": "presence", "opaque": false, "presenceEventType": e.presenceEventType.rawValue,
                "presenceUserType": e.presenceUserType.rawValue, "identityLimit": "PUBLIC_ENUM_NOT_PERSON_LOCATION_PROOF"], uniquingKeysWith: { _, new in new })
        } else if event is HMLocationEvent {
            result["kind"] = "location"; result["reason"] = "LOCATION_PAYLOAD_NOT_EXPORTED"
        } else { result["reason"] = "EVENT_SUBTYPE_UNSUPPORTED" }
        return result
    }

    func sceneDetail(_ scene: HMActionSet, home: HMHome) -> [String: Any] {
        let owned = scene.actionSetType == HMActionSetTypeTriggerOwned
        let userDefined = scene.actionSetType == HMActionSetTypeUserDefined
        let actions = scene.actions.sorted { $0.uniqueIdentifier.uuidString < $1.uniqueIdentifier.uuidString }
        let entries: [[String: Any]] = actions.prefix(256).map { action in
            var entry: [String: Any] = ["id": action.uniqueIdentifier.uuidString,
                "providerType": String(describing: type(of: action)), "kind": "opaque", "opaque": true]
            if let write = action as? HMCharacteristicWriteAction<NSCopying> {
                entry.merge(["kind": "characteristicWrite", "opaque": false,
                    "target": reference(write.characteristic, home: home), "targetValue": scalar(write.targetValue)], uniquingKeysWith: { _, new in new })
            } else { entry["reason"] = "ACTION_SUBTYPE_UNSUPPORTED_OR_SHORTCUT_OPAQUE" }
            return entry
        }
        return ["id": scene.uniqueIdentifier.uuidString, "homeId": home.uniqueIdentifier.uuidString,
            "name": scene.name, "actionSetType": scene.actionSetType,
            "listedInHome": home.actionSets.contains(where: { $0.uniqueIdentifier == scene.uniqueIdentifier }),
            "referencedByTriggerIds": home.triggers.filter { $0.actionSets.contains(where: { $0.uniqueIdentifier == scene.uniqueIdentifier }) }.map { $0.uniqueIdentifier.uuidString }.sorted(),
            "executing": scene.isExecuting, "lastExecutionDate": scene.lastExecutionDate.map { ISO8601DateFormatter().string(from: $0) } ?? NSNull(),
            "actions": entries, "actionCount": actions.count, "actionsTruncated": actions.count > 256,
            "publicAPICapabilities": ["execute": !owned, "rename": !owned, "removeFromHome": userDefined,
                "associateWithAnotherTrigger": !owned, "editCharacteristicActions": true],
            "capabilityLimit": "SDK_SURFACE_ONLY_PERMISSION_AND_CALLBACK_ACCEPTANCE_REQUIRED",
            "definitionCompleteness": "PUBLIC_API_ONLY_SHORTCUT_INTERNALS_UNAVAILABLE"]
    }

    func triggerDetail(_ trigger: HMTrigger, home: HMHome) -> [String: Any] {
        var result: [String: Any] = ["id": trigger.uniqueIdentifier.uuidString, "homeId": home.uniqueIdentifier.uuidString,
            "name": trigger.name, "enabled": trigger.isEnabled, "providerType": String(describing: type(of: trigger)),
            "sceneIds": trigger.actionSets.map { $0.uniqueIdentifier.uuidString }.sorted(), "kind": "opaque",
            "definitionCompleteness": "PUBLIC_API_ONLY", "publicAPICapabilities": ["rename": true, "enable": true, "remove": true],
            "capabilityLimit": "SDK_SURFACE_ONLY_PERMISSION_AND_CALLBACK_ACCEPTANCE_REQUIRED"]
        if let timer = trigger as? HMTimerTrigger {
            result["kind"] = "timer"; result["fireDate"] = ISO8601DateFormatter().string(from: timer.fireDate)
            result["timeZone"] = timer.timeZone?.identifier ?? NSNull()
            result["recurrence"] = dateComponents(timer.recurrence)
            result["recurrenceCalendar"] = timer.recurrenceCalendar.map { String(describing: $0.identifier) } ?? NSNull()
            result["deprecatedFields"] = ["timeZone", "recurrenceCalendar"]
        } else if let event = trigger as? HMEventTrigger {
            result["kind"] = "event"; result["activationState"] = event.triggerActivationState.rawValue
            result["executeOnce"] = event.executeOnce
            result["events"] = event.events.prefix(256).map { eventDetail($0, home: home) }
            result["endEvents"] = event.endEvents.prefix(256).map { eventDetail($0, home: home) }
            result["eventCount"] = event.events.count; result["endEventCount"] = event.endEvents.count
            result["eventsTruncated"] = event.events.count > 256 || event.endEvents.count > 256
            result["recurrences"] = event.recurrences.map { $0.prefix(256).map { dateComponents($0) } } ?? NSNull()
            result["recurrencesTruncated"] = (event.recurrences?.count ?? 0) > 256
            // Never serialize/evaluate predicate text or claim an editable allowlisted condition.
            result["condition"] = event.predicate == nil ? ["kind": "none"] : ["kind": "opaque", "reason": "PREDICATE_NOT_ALLOWLIST_DECODED"]
        } else { result["reason"] = "TRIGGER_SUBTYPE_UNSUPPORTED" }
        return result
    }

    func automationInventory(_ args: [String: Any]) -> [String: Any] {
        guard Set(args.keys).isSubset(of: ["homeId", "offset", "limit"]), let homeId = args["homeId"] as? String,
            let home = homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }) else { return ["error": "HOME_NOT_FOUND_OR_ARGUMENTS_INVALID"] }
        let offsetValue = args["offset"] ?? 0, limitValue = args["limit"] ?? 25
        guard let offset = try? ControlValue.decode(offsetValue, format: "int", minimum: 0, maximum: 1000000) as? NSNumber,
            let limit = try? ControlValue.decode(limitValue, format: "int", minimum: 1, maximum: 25) as? NSNumber else { return ["error": "PAGE_ARGUMENTS_INVALID"] }
        var sets: [UUID: HMActionSet] = [:]
        for set in home.actionSets + home.triggers.flatMap({ $0.actionSets }) { sets[set.uniqueIdentifier] = set }
        let scenes = sets.values.sorted { $0.uniqueIdentifier.uuidString < $1.uniqueIdentifier.uuidString }
        let triggers = home.triggers.sorted { $0.uniqueIdentifier.uuidString < $1.uniqueIdentifier.uuidString }
        let start = offset.intValue, size = limit.intValue, total = max(scenes.count, triggers.count)
        return ["schemaVersion": 1, "homeId": homeId, "valueSource": "provider-object-snapshot",
            "valuesAreFresh": false, "offset": start, "limit": size,
            "nextOffset": start + size < total ? start + size as Any : NSNull(),
            "sceneCount": scenes.count, "automationCount": triggers.count,
            "scenes": scenes.dropFirst(start).prefix(size).map { sceneDetail($0, home: home) },
            "automations": triggers.dropFirst(start).prefix(size).map { triggerDetail($0, home: home) },
            "consistency": "PAGES_NOT_ATOMIC_RESTART_IF_PROVIDER_CHANGES", "controlsAvailable": false]
    }

}
