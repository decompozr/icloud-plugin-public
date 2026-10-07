import Foundation
import HomeKit
import UIKit
import Darwin
import CryptoKit
import CoreFoundation

final class HomeDefinitions: HomeComponent, HMHomeDelegate {
    var lifecycleStore: LifecycleStore?
    var lifecycleJournal: ControlJournal?
    var lifecycleError: String?
    var lifecycleBusy = false
    var lifecycleInFlight = false
    var lifecycleReadback: LifecycleReadback?
    var lifecycleObservation: [String: Any]?
    func home(_ home: HMHome, didAdd trigger: HMTrigger) {
        guard let context = lifecycleObservation else { return }
        var record = context; record["phase"] = "home-delegate-did-add-trigger"
        record["homeId"] = home.uniqueIdentifier.uuidString
        record["definition"] = runtime.catalog.triggerDetail(trigger, home: home)
        try? lifecycleStore?.observe(record)
    }


    func lifecycleDefinition(home: HMHome, kind: String, resourceId: String) throws -> [String: Any] {
        if kind == "scene", let scene = (home.actionSets + home.triggers.flatMap { $0.actionSets }).first(where: { $0.uniqueIdentifier.uuidString == resourceId }) {
            return runtime.catalog.sceneDetail(scene, home: home)
        }
        if kind == "automation", let trigger = home.triggers.first(where: { $0.uniqueIdentifier.uuidString == resourceId }) {
            return runtime.catalog.triggerDetail(trigger, home: home)
        }
        throw ControlFailure.invalid("RESOURCE_NOT_FOUND")
    }

    func lifecyclePreview(_ args: [String: Any]) throws -> [String: Any] {
        guard Set(args.keys) == ["homeId", "kind", "resourceId"], let homeId = args["homeId"] as? String,
            let kind = args["kind"] as? String, let resourceId = args["resourceId"] as? String,
            let home = homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }) else { throw ControlFailure.invalid("PREVIEW_ARGUMENTS_OR_HOME_INVALID") }
        let definition = try lifecycleDefinition(home: home, kind: kind, resourceId: resourceId)
        let entry = try lifecycleStore?.entry(homeId: homeId, id: resourceId, kind: kind)
        return ["definition": definition, "revision": try LifecycleStore.revision(definition),
            "owned": entry?["state"] as? String == "owned", "ownershipState": entry?["state"] ?? "unowned",
            "valueSource": "provider-object-snapshot", "physicalCompletionVerified": false]
    }

    func lifecycleCharacteristic(_ target: [String: Any], home: HMHome) throws -> HMCharacteristic {
        guard Set(target.keys) == ["accessoryId", "serviceId", "characteristicId"],
            let accessoryId = target["accessoryId"] as? String, let serviceId = target["serviceId"] as? String,
            let characteristicId = target["characteristicId"] as? String,
            let accessory = home.accessories.first(where: { $0.uniqueIdentifier.uuidString == accessoryId }),
            let service = accessory.services.first(where: { $0.uniqueIdentifier.uuidString == serviceId }),
            let characteristic = service.characteristics.first(where: { $0.uniqueIdentifier.uuidString == characteristicId }) else { throw ControlFailure.invalid("EXACT_CHARACTERISTIC_UNRESOLVED") }
        return characteristic
    }

    func lifecycleEvents(_ values: Any?, home: HMHome, existing: [HMEvent]? = nil) throws -> [HMEvent] {
        guard let values = values as? [[String: Any]], (1...16).contains(values.count) else { throw ControlFailure.invalid("EVENTS_REQUIRED_OR_LIMIT") }
        if let existing = existing {
            let ids = values.compactMap { $0["eventId"] as? String }
            guard ids.count == values.count, Set(ids).count == ids.count, Set(ids) == Set(existing.map { $0.uniqueIdentifier.uuidString }) else { throw ControlFailure.invalid("UPDATE_REQUIRES_EXACT_EXISTING_EVENT_IDS") }
        }
        return try values.map { input in
            var value = input
            let original = existing?.first(where: { $0.uniqueIdentifier.uuidString == value["eventId"] as? String })
            value.removeValue(forKey: "eventId")
            if value["kind"] as? String == "calendar" {
                guard Set(value.keys) == ["kind", "hour", "minute", "timeZone"], (value["timeZone"] is NSNull || (value["timeZone"] as? String).flatMap { TimeZone(identifier: $0) } != nil),
                    let hour = try ControlValue.decode(value["hour"] ?? NSNull(), format: "int", minimum: 0, maximum: 23) as? NSNumber,
                    let minute = try ControlValue.decode(value["minute"] ?? NSNull(), format: "int", minimum: 0, maximum: 59) as? NSNumber else { throw ControlFailure.invalid("CALENDAR_EVENT_INVALID") }
                var components = DateComponents(); components.hour = hour.intValue; components.minute = minute.intValue
                components.timeZone = (value["timeZone"] as? String).flatMap { TimeZone(identifier: $0) }
                if let existing = existing {
                    guard !existing.isEmpty, let calendar = original as? HMCalendarEvent,
                        let mutable = calendar.mutableCopy() as? HMMutableCalendarEvent else { throw ControlFailure.invalid("CALENDAR_EVENT_TYPE_MISMATCH") }
                    mutable.fireDateComponents = components; return mutable
                }
                return HMCalendarEvent(fire: components)
            }
            if value["kind"] as? String == "characteristic" {
                guard Set(value.keys) == ["kind", "target", "value"], let target = value["target"] as? [String: Any] else { throw ControlFailure.invalid("CHARACTERISTIC_EVENT_INVALID") }
                let c = try lifecycleCharacteristic(target, home: home)
                guard c.properties.contains(HMCharacteristicPropertySupportsEventNotification) else { throw ControlFailure.invalid("EVENT_NOT_NOTIFIABLE") }
                let decoded = try ControlValue.decode(value["value"] ?? NSNull(), format: c.metadata?.format ?? "", minimum: c.metadata?.minimumValue,
                    maximum: c.metadata?.maximumValue, step: c.metadata?.stepValue, validValues: c.metadata?.validValues, maxLength: c.metadata?.maxLength)
                guard let copied = decoded as? NSCopying else { throw ControlFailure.invalid("EVENT_VALUE_NOT_COPYABLE") }
                if existing != nil {
                    guard let characteristic = original as? HMCharacteristicEvent<NSCopying>,
                        let mutable = characteristic.mutableCopy() as? HMMutableCharacteristicEvent<NSCopying> else { throw ControlFailure.invalid("CHARACTERISTIC_EVENT_TYPE_MISMATCH") }
                    mutable.characteristic = c; mutable.triggerValue = copied; return mutable
                }
                return HMCharacteristicEvent<NSCopying>(characteristic: c, triggerValue: copied)
            }
            throw ControlFailure.invalid("EVENT_KIND_NOT_ALLOWLISTED")
        }
    }

    func requireEditableScene(_ scene: HMActionSet, home: HMHome) throws {
        guard scene.actionSetType == HMActionSetTypeUserDefined, scene.actions.count <= 256,
            scene.actions.allSatisfy({ $0 is HMCharacteristicWriteAction<NSCopying> }),
            !home.triggers.contains(where: { $0.isEnabled && $0.actionSets.contains(where: { $0.uniqueIdentifier == scene.uniqueIdentifier }) }) else { throw ControlFailure.invalid("SCENE_RESTRICTED_OPAQUE_OR_ACTIVE_REFERENCE") }
        for action in scene.actions {
            if let write = action as? HMCharacteristicWriteAction<NSCopying>, runtime.catalog.reference(write.characteristic, home: home)["resolved"] as? Bool != true {
                throw ControlFailure.invalid("SCENE_REFERENCE_UNRESOLVED")
            }
        }
    }

    func requireEditableTrigger(_ trigger: HMEventTrigger, home: HMHome) throws {
        guard !trigger.isEnabled, trigger.predicate == nil, trigger.endEvents.isEmpty,
            trigger.recurrences == nil, !trigger.executeOnce, trigger.events.count <= 16,
            trigger.events.allSatisfy({ $0 is HMCalendarEvent || $0 is HMCharacteristicEvent<NSCopying> }) else { throw ControlFailure.invalid("TRIGGER_ACTIVE_OPAQUE_OR_OUTSIDE_SLICE") }
        for event in trigger.events {
            if let e = event as? HMCharacteristicEvent<NSCopying>, runtime.catalog.reference(e.characteristic, home: home)["resolved"] as? Bool != true { throw ControlFailure.invalid("EVENT_REFERENCE_UNRESOLVED") }
        }
    }

    func lifecycleRecoverCreation(_ args: [String: Any]) throws -> [String: Any] {
        guard !readOnly, !lifecycleBusy, !lifecycleInFlight, let store = lifecycleStore, lifecycleError == nil,
            Set(args.keys) == ["homeId", "creationOperationId", "resourceId", "expectedRevision"],
            let homeId = args["homeId"] as? String, let creation = args["creationOperationId"] as? String,
            let resourceId = args["resourceId"] as? String,
            let home = homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }) else { throw ControlFailure.invalid("CREATION_RECOVERY_ARGUMENTS_INVALID") }
        let proof = try store.creationProof(homeId: homeId, operationId: creation)
        guard proof["id"] as? String == resourceId, let trigger = home.triggers.first(where: { $0.uniqueIdentifier.uuidString == resourceId }) as? HMEventTrigger,
            trigger.name == proof["name"] as? String, !trigger.isEnabled, trigger.actionSets.isEmpty else { throw ControlFailure.invalid("CREATION_RECOVERY_IDENTITY_CHANGED") }
        try requireEditableTrigger(trigger, home: home)
        let current = runtime.catalog.triggerDetail(trigger, home: home)
        try LifecycleStore.requireRevision(args["expectedRevision"] as? String, snapshot: current)
        try store.record(homeId: homeId, id: resourceId, kind: "automation", state: "owned", operationId: creation, creationVerified: true)
        return ["creationOwnershipVerified": true, "homeMutationAttempted": false, "definition": current,
            "revision": try LifecycleStore.revision(current), "proof": "UNIQUE_OPERATION_CALLBACK_BASELINE_AND_INDEPENDENT_ADDITION", "originalOperationNotRetried": true]
    }

    func lifecycleReconcile(_ args: [String: Any]) throws -> [String: Any] {
        guard !readOnly, !lifecycleBusy, !lifecycleInFlight, lifecycleError == nil, let store = lifecycleStore,
            Set(args.keys) == ["homeId", "kind", "resourceId", "expectedRevision"], let homeId = args["homeId"] as? String,
            let resourceId = args["resourceId"] as? String, let kind = args["kind"] as? String,
            let home = homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }),
            let entry = try store.entry(homeId: homeId, id: resourceId, kind: kind), entry["state"] as? String == "uncertain",
            entry["creationVerified"] as? Bool == true, let creation = entry["creationOperationId"] as? String else { throw ControlFailure.invalid("RECONCILIATION_OWNERSHIP_OR_BUSY_INVALID") }
        let snapshot = try lifecycleDefinition(home: home, kind: kind, resourceId: resourceId)
        try LifecycleStore.requireRevision(args["expectedRevision"] as? String, snapshot: snapshot)
        if kind == "scene", let scene = home.actionSets.first(where: { $0.uniqueIdentifier.uuidString == resourceId }) { try requireEditableScene(scene, home: home) }
        else if kind == "automation", let trigger = home.triggers.first(where: { $0.uniqueIdentifier.uuidString == resourceId }) as? HMEventTrigger { try requireEditableTrigger(trigger, home: home) }
        else { throw ControlFailure.invalid("RECONCILIATION_UNSUPPORTED_RESOURCE") }
        try store.record(homeId: homeId, id: resourceId, kind: kind, state: "owned", operationId: creation)
        return ["reconciled": true, "homeMutationAttempted": false, "definition": snapshot,
            "revision": try LifecycleStore.revision(snapshot), "operationOutcome": "ORIGINAL_RECEIPT_RETAINED_NOT_RETRIED"]
    }

    func lifecycleMutate(id: Any, args: [String: Any]) {
        guard !readOnly, !runtime.controls.controlInFlight, !lifecycleBusy, !lifecycleInFlight, lifecycleError == nil, let store = lifecycleStore, let journal = lifecycleJournal else {
            reply(id: id, payload: ["error": "LIFECYCLE_DISABLED_BUSY_OR_UNAVAILABLE", "providerWriteAttempted": false], failed: true); return
        }
        guard let homeId = args["homeId"] as? String, let operationId = args["operationId"] as? String,
            UUID(uuidString: operationId) != nil, let action = args["action"] as? String,
            let home = homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }) else {
            reply(id: id, payload: ["error": "LIFECYCLE_ARGUMENTS_OR_HOME_INVALID", "providerWriteAttempted": false], failed: true); return
        }
        let request: [String: Any] = ["tool": "homekit_lifecycle_mutate", "arguments": args]
        do {
            if var replay = try journal.begin(operationId: operationId, request: request) {
                replay["replayed"] = true; reply(id: id, payload: replay, failed: replay["error"] is String); return
            }
        } catch { reply(id: id, payload: ["error": String(describing: error), "providerWriteAttempted": false], failed: true); return }
        lifecycleBusy = true
        var replied = false, attempted = false
        var resourceId = args["resourceId"] as? String
        let kind = args["kind"] as? String ?? (action == "createScene" ? "scene" : "automation")
        var creationOperation = operationId
        var timeout: DispatchWorkItem?
        func finish(_ result: [String: Any]) {
            guard !replied else { return }; replied = true; timeout?.cancel(); self.lifecycleBusy = false; self.lifecycleObservation = nil
            var payload = result; payload["operationId"] = operationId; payload["providerWriteAttempted"] = attempted
            payload["physicalCompletionVerified"] = false; payload["valueSource"] = "provider-object-after-callback"
            if let resourceId = resourceId { payload["resourceId"] = resourceId; payload["kind"] = kind }
            do { try journal.finish(operationId: operationId, request: request, result: payload) }
            catch { payload["error"] = "LIFECYCLE_RESULT_PERSISTENCE_FAILED_RECONCILE_REQUIRED"; payload["journalError"] = String(describing: error) }
            self.reply(id: id, payload: payload, failed: payload["error"] is String)
        }
        do {
            let common: Set<String> = ["homeId", "operationId", "action"]
            var scene: HMActionSet?, trigger: HMEventTrigger?, newTrigger: HMEventTrigger?
            var newEvents: [HMEvent]?, newAction: HMAction?, removedAction: HMAction?, linkedScene: HMActionSet?
            var updatedAction: HMCharacteristicWriteAction<NSCopying>?
            var actionTarget: [String: Any]?, actionValue: Any?, actionBaseline = Set<String>()
            var copiedActionValue: NSCopying?, confirmedActionId: String?
            var desiredName: String?
            let extra: Set<String>
            switch action {
            case "createScene": extra = ["name"]
            case "createAutomation": extra = ["name", "events"]
            case "rename": extra = ["kind", "resourceId", "expectedRevision", "name"]
            case "addAction": extra = ["kind", "resourceId", "expectedRevision", "target", "value"]
            case "updateAction": extra = ["kind", "resourceId", "expectedRevision", "actionId", "value"]
            case "removeAction": extra = ["kind", "resourceId", "expectedRevision", "actionId"]
            case "updateEvents": extra = ["kind", "resourceId", "expectedRevision", "events"]
            case "linkScene", "unlinkScene": extra = ["kind", "resourceId", "expectedRevision", "sceneId"]
            case "delete": extra = ["kind", "resourceId", "expectedRevision"]
            default: throw ControlFailure.invalid("LIFECYCLE_ACTION_UNSUPPORTED")
            }
            guard Set(args.keys) == common.union(extra) else { throw ControlFailure.invalid("LIFECYCLE_KEYS_INVALID") }
            if extra.contains("name") {
                guard let name = args["name"] as? String, !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                    name.utf8.count <= 120 else { throw ControlFailure.invalid("RESOURCE_NAME_INVALID") }
                desiredName = action.hasPrefix("create") ? try LifecycleStore.resourceName(name, operationId: operationId) : name
            }
            if action == "createAutomation" {
                newEvents = try lifecycleEvents(args["events"], home: home)
                newTrigger = HMEventTrigger(name: desiredName!, events: newEvents!, predicate: nil)
                guard !newTrigger!.isEnabled, newTrigger!.actionSets.isEmpty else { throw ControlFailure.invalid("NEW_TRIGGER_NOT_DISABLED_EMPTY") }
                resourceId = newTrigger!.uniqueIdentifier.uuidString
            } else if action != "createScene" {
                guard let currentId = resourceId, ["scene", "automation"].contains(kind) else { throw ControlFailure.invalid("RESOURCE_ID_KIND_REQUIRED") }
                creationOperation = try store.requireOwned(homeId: homeId, id: currentId, kind: kind)
                if action == "rename", let name = args["name"] as? String { desiredName = try LifecycleStore.resourceName(name, operationId: creationOperation) }
                let snapshot = try lifecycleDefinition(home: home, kind: kind, resourceId: currentId)
                try LifecycleStore.requireRevision(args["expectedRevision"] as? String, snapshot: snapshot)
                if kind == "scene" {
                    scene = home.actionSets.first(where: { $0.uniqueIdentifier.uuidString == currentId })
                    guard let scene = scene else { throw ControlFailure.invalid("USER_SCENE_NOT_FOUND") }
                    try requireEditableScene(scene, home: home)
                    if action == "delete", home.triggers.contains(where: { $0.actionSets.contains(where: { $0.uniqueIdentifier == scene.uniqueIdentifier }) }) { throw ControlFailure.invalid("SCENE_STILL_REFERENCED") }
                } else {
                    trigger = home.triggers.first(where: { $0.uniqueIdentifier.uuidString == currentId }) as? HMEventTrigger
                    guard let trigger = trigger else { throw ControlFailure.invalid("EVENT_TRIGGER_NOT_FOUND") }
                    try requireEditableTrigger(trigger, home: home)
                }
                if action == "addAction" {
                    guard let scene = scene, scene.actions.count < 256, let target = args["target"] as? [String: Any] else { throw ControlFailure.invalid("ACTION_SCENE_TARGET_REQUIRED") }
                    let c = try lifecycleCharacteristic(target, home: home)
                    guard c.properties.contains(HMCharacteristicPropertyWritable),
                        !scene.actions.contains(where: { ($0 as? HMCharacteristicWriteAction<NSCopying>)?.characteristic.uniqueIdentifier == c.uniqueIdentifier }) else { throw ControlFailure.invalid("ACTION_NOT_WRITABLE_OR_DUPLICATE_TARGET") }
                    let value = try ControlValue.decode(args["value"] ?? NSNull(), format: c.metadata?.format ?? "", minimum: c.metadata?.minimumValue,
                        maximum: c.metadata?.maximumValue, step: c.metadata?.stepValue, validValues: c.metadata?.validValues, maxLength: c.metadata?.maxLength)
                    guard let copied = value as? NSCopying else { throw ControlFailure.invalid("ACTION_VALUE_NOT_COPYABLE") }
                    newAction = HMCharacteristicWriteAction<NSCopying>(characteristic: c, targetValue: copied)
                    actionTarget = runtime.catalog.reference(c, home: home); actionValue = scalar(value)
                    actionBaseline = Set(scene.actions.map { $0.uniqueIdentifier.uuidString })
                } else if action == "updateAction" {
                    guard let scene = scene, let actionId = args["actionId"] as? String,
                        let entry = scene.actions.first(where: { $0.uniqueIdentifier.uuidString == actionId }) as? HMCharacteristicWriteAction<NSCopying> else { throw ControlFailure.invalid("ACTION_NOT_IN_OWNED_SCENE") }
                    let c = entry.characteristic
                    guard c.properties.contains(HMCharacteristicPropertyWritable) else { throw ControlFailure.invalid("ACTION_NOT_WRITABLE") }
                    let value = try ControlValue.decode(args["value"] ?? NSNull(), format: c.metadata?.format ?? "", minimum: c.metadata?.minimumValue,
                        maximum: c.metadata?.maximumValue, step: c.metadata?.stepValue, validValues: c.metadata?.validValues, maxLength: c.metadata?.maxLength)
                    guard let copied = value as? NSCopying else { throw ControlFailure.invalid("ACTION_VALUE_NOT_COPYABLE") }
                    updatedAction = entry; copiedActionValue = copied; confirmedActionId = actionId
                    actionTarget = runtime.catalog.reference(c, home: home); actionValue = scalar(value)
                } else if action == "removeAction" {
                    guard let scene = scene, let actionId = args["actionId"] as? String,
                        let entry = scene.actions.first(where: { $0.uniqueIdentifier.uuidString == actionId }) else { throw ControlFailure.invalid("ACTION_NOT_FOUND") }
                    removedAction = entry
                } else if action == "updateEvents" {
                    guard trigger != nil else { throw ControlFailure.invalid("EVENT_TRIGGER_REQUIRED") }
                    newEvents = try lifecycleEvents(args["events"], home: home, existing: trigger!.events.isEmpty ? nil : trigger!.events)
                } else if action == "linkScene" || action == "unlinkScene" {
                    guard let trigger = trigger, let sceneId = args["sceneId"] as? String,
                        let entry = home.actionSets.first(where: { $0.uniqueIdentifier.uuidString == sceneId }) else { throw ControlFailure.invalid("LINK_SCENE_NOT_FOUND") }
                    _ = try store.requireOwned(homeId: homeId, id: sceneId, kind: "scene")
                    try requireEditableScene(entry, home: home)
                    let associated = trigger.actionSets.contains(where: { $0.uniqueIdentifier == entry.uniqueIdentifier })
                    guard associated == (action == "unlinkScene") else { throw ControlFailure.invalid("LINK_STATE_CONFLICT") }
                    linkedScene = entry
                } else if !["rename", "delete"].contains(action) { throw ControlFailure.invalid("ACTION_RESOURCE_KIND_MISMATCH") }
            }
            if let currentId = resourceId {
                try store.record(homeId: homeId, id: currentId, kind: kind, state: "uncertain", operationId: creationOperation)
            }
            if action == "createAutomation" {
                lifecycleObservation = ["operationId": operationId, "submittedResourceId": resourceId ?? NSNull(),
                    "homeId": homeId, "baselineTriggerIds": home.triggers.map { $0.uniqueIdentifier.uuidString }]
                var record = lifecycleObservation!; record["phase"] = "before-add-trigger"
                record["definition"] = runtime.catalog.triggerDetail(newTrigger!, home: home)
                try store.observe(record)
            }
            attempted = true; lifecycleInFlight = true
            timeout = DispatchWorkItem { finish(["error": "LIFECYCLE_OUTCOME_UNKNOWN", "outcome": "reconcile-no-retry"]) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: timeout!)
            func completed(_ error: Error?) {
                DispatchQueue.main.async {
                    self.lifecycleInFlight = false
                    guard !replied else { return }
                    if let error = error { finish(["error": String(describing: error), "outcome": "provider-error-reconcile-no-retry"]); return }
                    self.lifecycleReadback = LifecycleReadback { homes in
                      if let providerManager = self.lifecycleReadback?.manager {
                          self.runtime.adoptManager(providerManager)
                          for observedHome in self.homes { observedHome.delegate = self }
                      }
                      self.lifecycleReadback = nil
                      guard !replied else { return }
                      do {
                        guard let observedHome = homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }) else { throw ControlFailure.invalid("READBACK_HOME_NOT_FOUND") }
                        if action == "createAutomation", let context = self.lifecycleObservation {
                            let baseline = Set(context["baselineTriggerIds"] as? [String] ?? [])
                            var record = context; record["phase"] = "independent-manager-readback"
                            record["newDefinitions"] = observedHome.triggers.filter { !baseline.contains($0.uniqueIdentifier.uuidString) }.map { self.runtime.catalog.triggerDetail($0, home: observedHome) }
                            try store.observe(record)
                            let proof = try store.creationProof(homeId: homeId, operationId: operationId)
                            guard let canonicalId = proof["id"] as? String else { throw ControlFailure.invalid("PERSISTED_CREATION_ID_MISSING") }
                            resourceId = canonicalId
                            try store.record(homeId: homeId, id: canonicalId, kind: kind, state: "uncertain", operationId: creationOperation, creationVerified: true)
                        }
                        guard let currentId = resourceId else { throw ControlFailure.invalid("CREATED_ID_MISSING") }
                        if action == "delete" {
                            let absent = kind == "scene" ? !observedHome.actionSets.contains(where: { $0.uniqueIdentifier.uuidString == currentId }) : !observedHome.triggers.contains(where: { $0.uniqueIdentifier.uuidString == currentId })
                            guard absent else { throw ControlFailure.invalid("DELETE_READBACK_MISMATCH") }
                            try store.record(homeId: homeId, id: currentId, kind: kind, state: "deleted", operationId: creationOperation)
                            finish(["writeAcknowledged": true, "definitionVerified": true, "absentVerified": true]); return
                        }
                        let observed = try self.lifecycleDefinition(home: observedHome, kind: kind, resourceId: currentId)
                        if let desiredName = desiredName, observed["name"] as? String != desiredName { throw ControlFailure.invalid("NAME_READBACK_MISMATCH") }
                        if kind == "automation", observed["enabled"] as? Bool != false { throw ControlFailure.invalid("DISABLED_READBACK_MISMATCH") }
                        let observedScene = observedHome.actionSets.first(where: { $0.uniqueIdentifier.uuidString == currentId })
                        let observedTrigger = observedHome.triggers.first(where: { $0.uniqueIdentifier.uuidString == currentId }) as? HMEventTrigger
                        if newAction != nil, let target = actionTarget, let value = actionValue {
                            guard let actions = observed["actions"] as? [[String: Any]], observed["actionsTruncated"] as? Bool == false else { throw ControlFailure.invalid("ACTION_READBACK_INCOMPLETE") }
                            confirmedActionId = try LifecycleStore.addedAction(actions, baseline: actionBaseline, target: target, value: value)
                        }
                        if updatedAction != nil, let target = actionTarget, let value = actionValue,
                            let actionId = confirmedActionId {
                            guard let entries = observed["actions"] as? [[String: Any]],
                                let entry = entries.first(where: { $0["id"] as? String == actionId }),
                                try LifecycleStore.actionMatches(entry, target: target, value: value) else { throw ControlFailure.invalid("ACTION_UPDATE_READBACK_MISMATCH") }
                        }
                        if let entry = removedAction, observedScene?.actions.contains(where: { $0.uniqueIdentifier == entry.uniqueIdentifier }) != false { throw ControlFailure.invalid("ACTION_REMOVE_READBACK_MISMATCH") }
                        if let entry = linkedScene, let trigger = observedTrigger,
                            trigger.actionSets.contains(where: { $0.uniqueIdentifier == entry.uniqueIdentifier }) != (action == "linkScene") { throw ControlFailure.invalid("LINK_READBACK_MISMATCH") }
                        if let expected = newEvents {
                            guard let actual = observedTrigger?.events else { throw ControlFailure.invalid("READBACK_TRIGGER_NOT_FOUND") }
                            func normalized(_ events: [HMEvent]) throws -> Data {
                                let entries = events.map { event -> [String: Any] in
                                    var detail = self.runtime.catalog.eventDetail(event, home: observedHome); detail.removeValue(forKey: "id"); detail.removeValue(forKey: "providerType"); return detail
                                }
                                return try JSONSerialization.data(withJSONObject: entries, options: [.sortedKeys])
                            }
                            guard try normalized(actual) == normalized(expected) else { throw ControlFailure.invalid("EVENT_READBACK_MISMATCH") }
                        }
                        try store.record(homeId: homeId, id: currentId, kind: kind, state: "owned", operationId: creationOperation)
                        var result: [String: Any] = ["writeAcknowledged": true, "definitionVerified": true, "definition": observed, "revision": try LifecycleStore.revision(observed)]
                        if let actionId = confirmedActionId { result["actionId"] = actionId }
                        finish(result)
                      } catch { finish(["error": String(describing: error), "writeAcknowledged": true, "outcome": "reconcile-no-retry"]) }
                    }
                }
            }
            if action == "createScene" {
                home.addActionSet(withName: desiredName!) { created, error in
                    DispatchQueue.main.async {
                        if let created = created {
                            resourceId = created.uniqueIdentifier.uuidString
                            do { try store.record(homeId: homeId, id: resourceId!, kind: "scene", state: "uncertain", operationId: creationOperation) }
                            catch { finish(["error": "CREATION_OWNERSHIP_PERSISTENCE_FAILED", "outcome": "reconcile-no-retry"]); return }
                        }
                        completed(error)
                    }
                }
            } else if let newTrigger = newTrigger {
                home.addTrigger(newTrigger) { error in
                    DispatchQueue.main.async {
                        do {
                            var record = self.lifecycleObservation ?? [:]; record["phase"] = "add-trigger-completion"
                            record["callbackError"] = error.map { String(describing: $0) } ?? NSNull()
                            record["definition"] = self.runtime.catalog.triggerDetail(newTrigger, home: home)
                            try store.observe(record)
                            // Read the submitted object's provider-assigned identity AFTER completion.
                            resourceId = newTrigger.uniqueIdentifier.uuidString
                            try store.record(homeId: homeId, id: resourceId!, kind: kind, state: "uncertain", operationId: creationOperation)
                        } catch { self.lifecycleInFlight = false; finish(["error": String(describing: error), "outcome": "reconcile-no-retry"]); return }
                        completed(error)
                    }
                }
            }
            else if action == "rename", let scene = scene { scene.updateName(desiredName!, completionHandler: completed) }
            else if action == "rename", let trigger = trigger { trigger.updateName(desiredName!, completionHandler: completed) }
            else if let entry = newAction { scene!.addAction(entry, completionHandler: completed) }
            else if let entry = updatedAction, let value = copiedActionValue { entry.updateTargetValue(value, completionHandler: completed) }
            else if let entry = removedAction { scene!.removeAction(entry, completionHandler: completed) }
            else if action == "updateEvents" { trigger!.updateEvents(newEvents!, completionHandler: completed) }
            else if action == "linkScene" { trigger!.addActionSet(linkedScene!, completionHandler: completed) }
            else if action == "unlinkScene" { trigger!.removeActionSet(linkedScene!, completionHandler: completed) }
            else if let scene = scene { home.removeActionSet(scene, completionHandler: completed) }
            else if let trigger = trigger { home.removeTrigger(trigger, completionHandler: completed) }
        } catch { finish(["error": String(describing: error), "outcome": "validation-or-persistence-failure"]) }
    }

}
