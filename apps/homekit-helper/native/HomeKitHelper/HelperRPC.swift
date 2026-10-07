import Foundation
import HomeKit
import UIKit
import Darwin
import CryptoKit
import CoreFoundation

final class HelperRPC: HomeComponent {
    func handle(_ request: [String: Any]) {
        guard let id = request["id"] else { return }
        guard request["jsonrpc"] as? String == "2.0", let method = request["method"] as? String else {
            emit(["jsonrpc": "2.0", "id": id, "error": ["code": -32600, "message": "Invalid request"]]); return
        }
        let params = request["params"] as? [String: Any] ?? [:]
        switch method {
        case "initialize":
            emit(["jsonrpc": "2.0", "id": id, "result": ["protocolVersion": "2024-11-05",
                "capabilities": ["tools": [:], "resources": ["subscribe": true]],
                "serverInfo": ["name": "icloud-homekit-helper", "version": "1.0.0",
                    "sourceSHA256": Bundle.main.object(forInfoDictionaryKey: "HomeKitSourceSHA256") as? String ?? "unbound"]]])
        case "ping": emit(["jsonrpc": "2.0", "id": id, "result": [:]])
        case "resources/list", "resources/read", "resources/subscribe", "resources/unsubscribe":
            runtime.events.handleResource(id: id, method: method, params: params)
        case "tools/list":
            var tools: [[String: Any]] = [
                ["name": "homekit_status", "description": "Read authorization and readiness; no device control.",
                 "inputSchema": ["type": "object", "properties": [:], "additionalProperties": false]],
                ["name": "homekit_list", "description": "List cached home inventory, capabilities, scenes and exposed triggers.",
                 "inputSchema": ["type": "object", "properties": [:], "additionalProperties": false]],
                ["name": "homekit_automation_inventory", "description": "Bounded rich public-API scene/trigger snapshot including trigger-owned action sets and opaque definitions. Read-only.",
                 "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"],
                    "offset": ["type": "integer", "minimum": 0, "maximum": 1000000],
                    "limit": ["type": "integer", "minimum": 1, "maximum": 25]], "required": ["homeId"], "additionalProperties": false]],
                ["name": "homekit_lifecycle_preview", "description": "Read exact scene/automation definition and revision; reports task-owned status, never mutates.",
                 "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"], "resourceId": ["type": "string"],
                    "kind": ["type": "string", "enum": ["scene", "automation"]]], "required": ["homeId", "resourceId", "kind"], "additionalProperties": false]],
                ["name": "homekit_read", "description": "Fresh read of one exact home/accessory/service/characteristic target. No writes.",
                 "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"],
                    "accessoryId": ["type": "string"], "serviceId": ["type": "string"],
                    "characteristicId": ["type": "string"]],
                    "required": ["homeId", "accessoryId", "serviceId", "characteristicId"], "additionalProperties": false]],
            ]
            if !readOnly && runtime.definitions.lifecycleStore != nil && runtime.definitions.lifecycleJournal != nil && runtime.definitions.lifecycleError == nil {
                tools.append(["name": "homekit_lifecycle_recover_creation", "description": "Ledger-only recovery using retained successful callback, random operation marker, baseline IDs and one independent addition. Does not recover by name alone or retry Home writes.",
                    "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"], "creationOperationId": ["type": "string"], "resourceId": ["type": "string"], "expectedRevision": ["type": "string"]], "required": ["homeId", "creationOperationId", "resourceId", "expectedRevision"], "additionalProperties": false]])
                tools.append(["name": "homekit_lifecycle_reconcile", "description": "Reconcile exact previously confirmed task-owned uncertain resource against a new revision; no Home mutation and no retry of original operation.",
                    "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"], "kind": ["type": "string", "enum": ["scene", "automation"]],
                        "resourceId": ["type": "string"], "expectedRevision": ["type": "string"]], "required": ["homeId", "kind", "resourceId", "expectedRevision"], "additionalProperties": false]])
                tools.append(["name": "homekit_lifecycle_mutate", "description": "App-owned scenes and disabled event triggers. Exact-ID revision-checked edits; no enable/execute.",
                    "inputSchema": ["type": "object", "properties": ["homeId": ["type": "string"], "operationId": ["type": "string"],
                        "action": ["type": "string", "enum": ["createScene", "createAutomation", "rename", "addAction", "updateAction", "removeAction", "updateEvents", "linkScene", "unlinkScene", "delete"]],
                        "kind": ["type": "string", "enum": ["scene", "automation"]], "resourceId": ["type": "string"],
                        "expectedRevision": ["type": "string"], "name": ["type": "string"], "events": ["type": "array", "maxItems": 16],
                        "sceneId": ["type": "string"], "actionId": ["type": "string"], "target": ["type": "object"], "value": [:]],
                        "required": ["homeId", "operationId", "action"], "additionalProperties": false]])
            }
            if productionControls && runtime.controls.controlEnabled {
                tools.append(["name": "homekit_control_outcome", "description": "Read retained exact operation journal evidence without provider mutation or retry.", "inputSchema": ["type": "object"]])
                tools.append(["name": "homekit_control_preview", "description": "Review an exact production target and revision; app-owned definitions only; no physical operation.", "inputSchema": ["type": "object"]])
                tools.append(["name": "homekit_control_apply", "description": "Revision-checked production control with durable operation reservation; no automatic retry.", "inputSchema": ["type": "object"]])
            }
            emit(["jsonrpc": "2.0", "id": id, "result": ["tools": tools]])
        case "tools/call":
            let args = params["arguments"] as? [String: Any] ?? [:]
            let name = params["name"] as? String ?? ""
            var payload: [String: Any]
            var failed = false
            if name == "homekit_status" { payload = runtime.status() }
            else if !runtime.ready || !runtime.homeAuthorized {
                payload = ["error": "HOMEKIT_NOT_READY_OR_AUTHORIZED", "status": runtime.status()]; failed = true
            } else if name == "homekit_list" { payload = runtime.catalog.inventory() }
            else if name == "homekit_automation_inventory" { payload = runtime.catalog.automationInventory(args); failed = payload["error"] != nil }
            else if name == "homekit_lifecycle_preview" {
                do { payload = try runtime.definitions.lifecyclePreview(args) } catch { payload = ["error": String(describing: error)]; failed = true }
            }
            else if name == "homekit_lifecycle_recover_creation" {
                do { payload = try runtime.definitions.lifecycleRecoverCreation(args) } catch { payload = ["error": String(describing: error)]; failed = true }
            }
            else if name == "homekit_lifecycle_reconcile" {
                do { payload = try runtime.definitions.lifecycleReconcile(args) } catch { payload = ["error": String(describing: error)]; failed = true }
            }
            else if name == "homekit_lifecycle_mutate" { runtime.definitions.lifecycleMutate(id: id, args: args); return }
            else if name == "homekit_control_preview" {
                do { payload = try runtime.controls.productionControlPreview(args) } catch { payload = ["error": String(describing: error)]; failed = true }
            }
            else if name == "homekit_control_outcome" {
                do { payload = try runtime.controls.productionControlOutcome(args) } catch { payload = ["error": String(describing: error)]; failed = true }
            }
            else if name == "homekit_control_apply" {
                guard productionControls else { reply(id: id, payload: ["error": "PRODUCTION_CONTROL_DISABLED"], failed: true); return }
                var target = args; target.removeValue(forKey: "action")
                let tool = args["action"] as? String == "write" ? "homekit_write" : args["action"] as? String == "executeScene" ? "homekit_execute_scene" : args["action"] as? String == "setAutomationEnabled" ? "homekit_set_automation_enabled" : "invalid"
                guard tool != "invalid" else { reply(id: id, payload: ["error": "INVALID_CONTROL_ACTION"], failed: true); return }
                runtime.controls.control(id: id, name: tool, args: target, productionIntent: args); return
            }
            else if name == "homekit_read" {
                guard let homeId = args["homeId"] as? String, let accessoryId = args["accessoryId"] as? String,
                      let serviceId = args["serviceId"] as? String, let characteristicId = args["characteristicId"] as? String,
                      let home = homes.first(where: { $0.uniqueIdentifier.uuidString == homeId }),
                      let accessory = home.accessories.first(where: { $0.uniqueIdentifier.uuidString == accessoryId }),
                      let service = accessory.services.first(where: { $0.uniqueIdentifier.uuidString == serviceId }),
                      let c = service.characteristics.first(where: { $0.uniqueIdentifier.uuidString == characteristicId }),
                      c.properties.contains(HMCharacteristicPropertyReadable) else {
                    reply(id: id, payload: ["error": "TARGET_UNRESOLVED_OR_NOT_READABLE"], failed: true); return
                }
                var replied = false
                let timeout = DispatchWorkItem {
                    if replied { return }; replied = true
                    self.reply(id: id, payload: ["error": "READ_TIMEOUT"], failed: true)
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: timeout)
                c.readValue { error in
                    DispatchQueue.main.async {
                        if replied { return }; replied = true; timeout.cancel()
                        self.reply(id: id, payload: ["homeId": homeId, "accessoryId": accessoryId,
                            "serviceId": serviceId, "characteristicId": characteristicId,
                            "value": self.scalar(c.value), "valueSource": "fresh-read",
                            "error": error.map { String(describing: $0) } ?? NSNull()], failed: error != nil)
                    }
                }
                return
            }
            else { payload = ["error": "UNKNOWN_TOOL_OR_INVALID_ARGUMENTS"]; failed = true }
            reply(id: id, payload: payload, failed: failed)
        default: emit(["jsonrpc": "2.0", "id": id, "error": ["code": -32601, "message": "Method not found"]])
        }
    }
}
