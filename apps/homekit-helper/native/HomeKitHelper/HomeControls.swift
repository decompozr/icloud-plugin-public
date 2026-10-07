import Foundation
import HomeKit
import UIKit
import Darwin
import CryptoKit
import CoreFoundation

final class HomeControls: HomeComponent {
    var controlInFlight = false
    var controlJournal: ControlJournal?
    var controlJournalError: String?
    var controlEnabled: Bool { productionControls && runtime.launch.homeId != nil && runtime.definitions.lifecycleError == nil && controlJournal != nil }
    func productionControlOutcome(_ args: [String: Any]) throws -> [String: Any] {
        guard productionControls, let journal = controlJournal, let id = args["operationId"] as? String,
              UUID(uuidString: id) != nil, let home = args["homeId"] as? String else { throw ControlFailure.invalid("CONTROL_OUTCOME_ARGUMENTS_OR_DISABLED") }
        var target = args; target.removeValue(forKey: "action")
        let tool = args["action"] as? String == "write" ? "homekit_write" : args["action"] as? String == "executeScene" ? "homekit_execute_scene" : args["action"] as? String == "setAutomationEnabled" ? "homekit_set_automation_enabled" : "invalid"
        guard tool != "invalid" else { throw ControlFailure.invalid("CONTROL_ACTION_UNSUPPORTED") }
        let result = try journal.outcome(operationId: id, request: ["tool": tool, "arguments": target])
        return ["operationId": id, "homeId": home, "found": result != nil, "result": result ?? NSNull(), "providerWriteAttempted": false]
    }

    func productionControlPreview(_ args: [String: Any]) throws -> [String: Any] {
        guard productionControls, controlEnabled, let store = runtime.definitions.lifecycleStore,
              let homeId = args["homeId"] as? String, UUID(uuidString: homeId) != nil,
              let operationId = args["operationId"] as? String, UUID(uuidString: operationId) != nil,
              let home = homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }),
              let action = args["action"] as? String else { throw ControlFailure.invalid("PRODUCTION_CONTROL_UNAVAILABLE_OR_HOME") }
        var definition: [String: Any]
        func checkedScene(_ scene: HMActionSet, allowedReference: String? = nil) throws -> [String: Any] {
            _ = try store.requireOwned(homeId: homeId, id: scene.uniqueIdentifier.uuidString, kind: "scene")
            var snapshot = runtime.catalog.sceneDetail(scene, home: home)
            guard scene.actionSetType == HMActionSetTypeUserDefined else { throw ControlFailure.invalid("SCENE_TYPE_UNSUPPORTED") }
            snapshot["actionSetType"] = "HMActionSetTypeUserDefined"
            if let reference = allowedReference {
                let references = snapshot["referencedByTriggerIds"] as? [String] ?? []
                guard references.allSatisfy({ $0 == reference }) else { throw ControlFailure.invalid("SCENE_FOREIGN_REFERENCE") }
                snapshot["referencedByTriggerIds"] = [String]()
            }
            try ProductionControlPolicy.scene(snapshot, homeId: homeId)
            for entry in scene.actions {
                guard let write = entry as? HMCharacteristicWriteAction<NSCopying>,
                      write.characteristic.properties.contains(HMCharacteristicPropertyWritable),
                      !["array", "dict"].contains(write.characteristic.metadata?.format ?? "") else { throw ControlFailure.invalid("SCENE_NOT_WRITABLE") }
                let c = write.characteristic
                _ = try ControlValue.decodeProviderTarget(scalar(write.targetValue), format: c.metadata?.format ?? "", minimum: c.metadata?.minimumValue,
                    maximum: c.metadata?.maximumValue, step: c.metadata?.stepValue, validValues: c.metadata?.validValues, maxLength: c.metadata?.maxLength)
            }
            return runtime.catalog.sceneDetail(scene, home: home)
        }
        if action == "write" {
            guard Set(args.keys) == ["action", "homeId", "operationId", "accessoryId", "serviceId", "characteristicId", "value"] else { throw ControlFailure.invalid("CONTROL_ARGUMENTS_INVALID") }
            let target = ["accessoryId": args["accessoryId"]!, "serviceId": args["serviceId"]!, "characteristicId": args["characteristicId"]!]
            let c = try runtime.definitions.lifecycleCharacteristic(target, home: home)
            guard let accessory = c.service?.accessory, accessory.isReachable, c.properties.contains(HMCharacteristicPropertyWritable),
                  let value = args["value"], !["array", "dict"].contains(c.metadata?.format ?? "") else { throw ControlFailure.invalid("CONTROL_TARGET_NOT_WRITABLE_OR_FORMAT_DEFERRED") }
            _ = try ControlValue.decode(value, format: c.metadata?.format ?? "", minimum: c.metadata?.minimumValue,
                maximum: c.metadata?.maximumValue, step: c.metadata?.stepValue, validValues: c.metadata?.validValues, maxLength: c.metadata?.maxLength)
            definition = ["homeId": homeId, "accessoryId": args["accessoryId"]!, "serviceId": args["serviceId"]!, "characteristicId": args["characteristicId"]!,
                "type": c.characteristicType, "properties": c.properties.sorted(), "format": c.metadata?.format ?? "",
                "minimum": scalar(c.metadata?.minimumValue), "maximum": scalar(c.metadata?.maximumValue),
                "step": scalar(c.metadata?.stepValue), "maxLength": scalar(c.metadata?.maxLength), "validValues": c.metadata?.validValues ?? []]
        } else if action == "executeScene" {
            guard Set(args.keys) == ["action", "homeId", "operationId", "sceneId"], let id = args["sceneId"] as? String,
                  let scene = home.actionSets.first(where: { $0.uniqueIdentifier.uuidString == id }) else { throw ControlFailure.invalid("CONTROL_SCENE_UNRESOLVED") }
            definition = try checkedScene(scene)
        } else if action == "setAutomationEnabled" {
            guard Set(args.keys) == ["action", "homeId", "operationId", "automationId", "enabled"],
                  let enabled = args["enabled"] as? NSNumber, CFGetTypeID(enabled) == CFBooleanGetTypeID(),
                  let id = args["automationId"] as? String,
                  let trigger = home.triggers.first(where: { $0.uniqueIdentifier.uuidString == id }) as? HMEventTrigger,
                  trigger.predicate == nil, trigger.endEvents.isEmpty, trigger.recurrences == nil,
                  (1...16).contains(trigger.events.count), trigger.events.allSatisfy({ $0 is HMCalendarEvent || $0 is HMCharacteristicEvent<NSCopying> }),
                  trigger.actionSets.count <= 16 else { throw ControlFailure.invalid("CONTROL_AUTOMATION_UNSUPPORTED") }
            _ = try store.requireOwned(homeId: homeId, id: id, kind: "automation")
            definition = runtime.catalog.triggerDetail(trigger, home: home)
            definition["scenes"] = try trigger.actionSets.map { try checkedScene($0, allowedReference: id) }
        } else { throw ControlFailure.invalid("CONTROL_ACTION_UNSUPPORTED") }
        return ["homeId": homeId, "operationId": operationId, "definition": definition,
            "revision": try LifecycleStore.revision(definition), "physicalCompletionVerified": false]
    }

    private struct SceneReadbackTarget {
        let actionId: String
        let characteristic: HMCharacteristic
        let format: String
        let desired: NSObject
    }
    private func sceneReadbackTargets(_ scene: HMActionSet) throws -> [SceneReadbackTarget] {
        try scene.actions.map { entry in
            guard let action = entry as? HMCharacteristicWriteAction<NSCopying> else { throw ControlFailure.invalid("SCENE_ACTION_UNSUPPORTED") }
            let c = action.characteristic, format = c.metadata?.format ?? ""
            guard let desired = try ControlValue.decodeProviderTarget(scalar(action.targetValue), format: format) as? NSObject else { throw ControlFailure.invalid("SCENE_TARGET_VALUE_UNSUPPORTED") }
            return SceneReadbackTarget(actionId: action.uniqueIdentifier.uuidString, characteristic: c, format: format, desired: desired)
        }
    }
    private func readSceneActions(_ actions: [SceneReadbackTarget], completion: @escaping ([[String: Any]]) -> Void) {
        var remaining = actions.count, results: [[String: Any]] = []
        guard remaining > 0 else { completion([]); return }
        func observed(_ action: SceneReadbackTarget, _ status: String) {
            results.append(["actionId": action.actionId, "characteristicId": action.characteristic.uniqueIdentifier.uuidString, "status": status])
            remaining -= 1
            if remaining == 0 { completion(results.sorted { ($0["actionId"] as! String) < ($1["actionId"] as! String) }) }
        }
        for action in actions {
            let c = action.characteristic
            guard c.properties.contains(HMCharacteristicPropertyReadable) else { observed(action, "unreadable"); continue }
            c.readValue { error in
                DispatchQueue.main.async {
                    guard error == nil, let value = c.value, c.metadata?.format == action.format else { observed(action, "read_failed"); return }
                    do {
                        let actual = try ControlValue.decodeProviderTarget(self.scalar(value), format: action.format)
                        observed(action, action.desired.isEqual(actual) ? "verified" : "mismatch")
                    } catch { observed(action, "mismatch") }
                }
            }
        }
    }

    func control(id: Any, name: String, args: [String: Any], productionIntent: [String: Any]? = nil) {
        guard controlEnabled, let journal = controlJournal else {
            reply(id: id, payload: ["error": "CONTROL_DISABLED_OR_JOURNAL_UNAVAILABLE"], failed: true); return
        }
        if productionControls {
            do {
                guard !controlInFlight, !runtime.definitions.lifecycleBusy, !runtime.definitions.lifecycleInFlight, let intent = productionIntent,
                      let expected = args["expectedRevision"] as? String else { throw ControlFailure.invalid("CONTROL_BUSY_OR_REVIEW_REQUIRED") }
                var command = intent; command.removeValue(forKey: "expectedRevision")
                let preview = try productionControlPreview(command)
                guard preview["revision"] as? String == expected else { throw ControlFailure.invalid("STALE_CONTROL_REVISION") }
            } catch {
                reply(id: id, payload: ["error": String(describing: error), "operationId": args["operationId"] ?? NSNull(),
                    "intent": productionIntent ?? args, "providerWriteAttempted": false, "physicalCompletionVerified": false], failed: true); return
            }
        }
        var keys: Set<String> = name == "homekit_write"
            ? ["homeId", "accessoryId", "serviceId", "characteristicId", "value", "operationId"]
            : name == "homekit_execute_scene" ? ["homeId", "sceneId", "operationId"]
            : ["homeId", "automationId", "enabled", "operationId"]
        if productionControls { keys.insert("expectedRevision") }
        guard Set(args.keys) == keys, let operationId = args["operationId"] as? String,
              let homeId = args["homeId"] as? String,
              let home = homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }) else {
            reply(id: id, payload: ["error": "INVALID_ARGUMENTS_OR_HOME"], failed: true); return
        }
        var characteristic: HMCharacteristic?
        var desiredValue: Any?
        var scene: HMActionSet?
        var trigger: HMTrigger?
        do {
            if name == "homekit_write" {
                guard let accessoryId = args["accessoryId"] as? String, let serviceId = args["serviceId"] as? String,
                      let characteristicId = args["characteristicId"] as? String,
                      let accessory = home.accessories.first(where: { $0.uniqueIdentifier.uuidString == accessoryId }),
                      accessory.isReachable,
                      let service = accessory.services.first(where: { $0.uniqueIdentifier.uuidString == serviceId }),
                      let c = service.characteristics.first(where: { $0.uniqueIdentifier.uuidString == characteristicId }),
                      c.properties.contains(HMCharacteristicPropertyWritable), let value = args["value"] else {
                    throw ControlFailure.invalid("TARGET_UNRESOLVED_UNREACHABLE_OR_NOT_WRITABLE")
                }
                desiredValue = try ControlValue.decode(value, format: c.metadata?.format ?? "",
                    minimum: c.metadata?.minimumValue, maximum: c.metadata?.maximumValue,
                    step: c.metadata?.stepValue, validValues: c.metadata?.validValues, maxLength: c.metadata?.maxLength)
                characteristic = c
            } else if name == "homekit_execute_scene" {
                guard let sceneId = args["sceneId"] as? String,
                      let actionSet = home.actionSets.first(where: { $0.uniqueIdentifier.uuidString == sceneId }) else {
                    throw ControlFailure.invalid("SCENE_UNRESOLVED")
                }
                scene = actionSet
            } else {
                guard let automationId = args["automationId"] as? String,
                      let enabled = args["enabled"] as? NSNumber, CFGetTypeID(enabled) == CFBooleanGetTypeID(),
                      let automation = home.triggers.first(where: { $0.uniqueIdentifier.uuidString == automationId }) else {
                    throw ControlFailure.invalid("AUTOMATION_UNRESOLVED_OR_BOOLEAN_REQUIRED")
                }
                trigger = automation
            }
        } catch {
            reply(id: id, payload: ["error": String(describing: error)], failed: true); return
        }
        let request: [String: Any] = ["tool": name, "arguments": args]
        let sceneTargets: [SceneReadbackTarget]
        do { sceneTargets = try scene.map(sceneReadbackTargets) ?? [] }
        catch { self.controlInFlight = false; reply(id: id, payload: ["error": "SCENE_TARGET_VALUE_UNSUPPORTED", "operationId": operationId, "intent": productionIntent ?? args, "physicalCompletionVerified": false, "providerWriteAttempted": false], failed: true); return }
        do {
            if var replay = try journal.begin(operationId: operationId, request: request) {
                replay["replayed"] = true
                reply(id: id, payload: replay, failed: replay["error"] is String); return
            }
        } catch {
            reply(id: id, payload: ["error": String(describing: error), "providerWriteAttempted": false], failed: true); return
        }
        if productionControls { controlInFlight = true }
        var replied = false
        var acknowledged = false
        var timeout: DispatchWorkItem?
        func finish(_ result: [String: Any]) {
            if replied { return }; replied = true; timeout?.cancel()
            if !["WRITE_OUTCOME_UNKNOWN", "READBACK_TIMEOUT", "SCENE_READBACK_TIMEOUT"].contains(result["error"] as? String ?? "") { self.controlInFlight = false }
            var payload = result
            payload["operationId"] = operationId
            payload["providerWriteAttempted"] = true
            if let intent = productionIntent { payload["intent"] = intent }
            payload["physicalCompletionVerified"] = false
            do { try journal.finish(operationId: operationId, request: request, result: payload) }
            catch { payload["journalError"] = String(describing: error); payload["error"] = "RESULT_PERSISTENCE_FAILED_RECONCILE_REQUIRED" }
            self.reply(id: id, payload: payload, failed: payload["error"] is String)
        }
        timeout = DispatchWorkItem {
            finish(["error": acknowledged ? "READBACK_TIMEOUT" : "WRITE_OUTCOME_UNKNOWN", "writeAcknowledged": acknowledged])
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: timeout!)
        let completion: (Error?) -> Void = { error in
            DispatchQueue.main.async {
                if replied { self.controlInFlight = false; return }
                if let error = error {
                    finish(["error": String(describing: error), "writeAcknowledged": false,
                        "outcome": "provider-error-reconcile-before-retry"]); return
                }
                acknowledged = true
                if let c = characteristic, let desired = desiredValue {
                    if !c.properties.contains(HMCharacteristicPropertyReadable) {
                        finish(["writeAcknowledged": true, "valueVerified": false, "readbackAvailable": false]); return
                    }
                    timeout?.cancel()
                    timeout = DispatchWorkItem { finish(["error": "READBACK_TIMEOUT", "writeAcknowledged": true]) }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: timeout!)
                    c.readValue { readError in
                        DispatchQueue.main.async {
                            self.controlInFlight = false
                            if replied { return }
                            let verified = readError == nil && c.value.map { (desired as? NSObject)?.isEqual($0) == true } == true
                            var result: [String: Any] = ["writeAcknowledged": true, "valueVerified": verified,
                                "desired": self.scalar(desired), "observed": self.scalar(c.value), "valueSource": "fresh-read"]
                            if let readError = readError { result["error"] = String(describing: readError); result["valueSource"] = "read-failed" }
                            else if !verified { result["error"] = "READBACK_MISMATCH" }
                            finish(result)
                        }
                    }
                } else if let trigger = trigger {
                    let expected = (args["enabled"] as! NSNumber).boolValue
                    var result: [String: Any] = ["writeAcknowledged": true, "enabled": trigger.isEnabled,
                        "enabledVerified": trigger.isEnabled == expected, "valueSource": "provider-object-after-callback"]
                    if trigger.isEnabled != expected { result["error"] = "AUTOMATION_STATE_MISMATCH" }
                    finish(result)
                } else if scene != nil {
                    timeout?.cancel()
                    timeout = DispatchWorkItem { finish(["error": "SCENE_READBACK_TIMEOUT", "writeAcknowledged": true,
                        "sceneExecutionAcknowledged": true, "individualActionsVerified": false]) }
                    DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: timeout!)
                    self.readSceneActions(sceneTargets) { observations in
                        self.controlInFlight = false
                        if replied { return }
                        finish(SceneReadbackPolicy.summarize(observations))
                    }
                }
            }
        }
        if let c = characteristic, let desired = desiredValue { c.writeValue(desired, completionHandler: completion) }
        else if let scene = scene { home.executeActionSet(scene, completionHandler: completion) }
        else if let trigger = trigger { trigger.enable((args["enabled"] as! NSNumber).boolValue, completionHandler: completion) }
    }

}
