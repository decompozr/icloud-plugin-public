import Foundation
import CoreFoundation
enum ControlFailure: Error { case invalid(String) }

enum ControlValue {
    static let formats: Set<String> = ["bool", "int", "float", "uint8", "uint16", "uint32", "uint64", "string", "data", "tlv8", "array", "dict"]
    // Only for SDK-owned scene/readback values. External command decoding stays strict.
    static func decodeProviderTarget(_ value: Any, format: String, minimum: NSNumber? = nil, maximum: NSNumber? = nil,
                                     step: NSNumber? = nil, validValues: [NSNumber]? = nil, maxLength: NSNumber? = nil) throws -> Any {
        var observed = value
        if format == "bool" {
            guard let number = value as? NSNumber, number.doubleValue == 0 || number.doubleValue == 1 else {
                throw ControlFailure.invalid("PROVIDER_BOOLEAN_INVALID")
            }
            observed = NSNumber(value: number.boolValue)
        }
        return try decode(observed, format: format, minimum: minimum, maximum: maximum,
                          step: step, validValues: validValues, maxLength: maxLength)
    }
    static func decode(_ value: Any, format: String, minimum: NSNumber? = nil, maximum: NSNumber? = nil,
                       step: NSNumber? = nil, validValues: [NSNumber]? = nil, maxLength: NSNumber? = nil) throws -> Any {
        func reject(_ reason: String) throws -> Never { throw ControlFailure.invalid(reason) }
        switch format {
        case "bool":
            guard let n = value as? NSNumber, CFGetTypeID(n) == CFBooleanGetTypeID() else { try reject("BOOLEAN_REQUIRED") }
            return n.boolValue
        case "int", "float", "uint8", "uint16", "uint32", "uint64":
            let exactUInt64 = (value as? [String: Any]).flatMap { object -> UInt64? in
                guard format == "uint64", Set(object.keys) == ["decimal"], let text = object["decimal"] as? String,
                      !text.isEmpty, text.utf8.allSatisfy({ (48...57).contains($0) }) else { return nil }
                return UInt64(text)
            }
            guard let n = exactUInt64.map({ NSNumber(value: $0) }) ?? (value as? NSNumber),
                  CFGetTypeID(n) != CFBooleanGetTypeID(), n.doubleValue.isFinite else { try reject("NUMBER_REQUIRED") }
            let v = n.doubleValue
            if format != "float", v.rounded(.towardZero) != v { try reject("INTEGER_REQUIRED") }
            // UInt64 JSON numbers must remain exact; larger values can lose precision in MCP clients.
            let bounds: [String: (Double, Double)] = ["int": (-2147483648, 2147483647), "uint8": (0, 255),
                "uint16": (0, 65535), "uint32": (0, 4294967295), "uint64": (0, 9007199254740991)]
            if exactUInt64 == nil, let (lo, hi) = bounds[format], !(lo...hi).contains(v) { try reject("FORMAT_RANGE_INVALID") }
            if let minimum = minimum, n.compare(minimum) == .orderedAscending { try reject("BELOW_MINIMUM") }
            if let maximum = maximum, n.compare(maximum) == .orderedDescending { try reject("ABOVE_MAXIMUM") }
            if let values = validValues, !values.isEmpty, !values.contains(where: { $0.compare(n) == .orderedSame }) { try reject("ENUM_VALUE_INVALID") }
            if let step = step, step.doubleValue > 0 {
                let offset = (v - (minimum?.doubleValue ?? 0)) / step.doubleValue
                if abs(offset - offset.rounded()) > 1e-7 { try reject("STEP_VALUE_INVALID") }
            }
            return n
        case "string":
            guard let text = value as? String else { try reject("STRING_REQUIRED") }
            if let length = maxLength, text.utf8.count > length.intValue { try reject("STRING_TOO_LONG") }
            return text
        case "data", "tlv8":
            guard let object = value as? [String: Any], Set(object.keys) == ["base64"],
                  let encoded = object["base64"] as? String, let data = Data(base64Encoded: encoded) else { try reject("BASE64_DATA_REQUIRED") }
            if format == "tlv8" {
                let bytes = [UInt8](data); var offset = 0
                while offset < bytes.count {
                    guard offset + 2 <= bytes.count else { try reject("TLV8_TRUNCATED") }
                    offset += 2 + Int(bytes[offset + 1])
                    if offset > bytes.count { try reject("TLV8_TRUNCATED") }
                }
            }
            return data
        case "array":
            guard let array = value as? [Any], JSONSerialization.isValidJSONObject(array) else { try reject("ARRAY_REQUIRED") }
            return array
        case "dict":
            guard let object = value as? [String: Any], JSONSerialization.isValidJSONObject(object) else { try reject("DICTIONARY_REQUIRED") }
            return object
        default: try reject("PROVIDER_FORMAT_UNSUPPORTED")
        }
    }
}

// Each begin holds an interprocess file lock while replaying and reserving the operation.
// A crash after reservation always replays as unknown; it never automatically retries I/O.

enum ProductionControlPolicy {
    static func existingScene(_ definition: [String: Any], homeId: String) throws {
        try scene(definition, homeId: homeId)
        guard let actions = definition["actions"] as? [[String: Any]], !actions.isEmpty else {
            throw ControlFailure.invalid("EXISTING_SCENE_EFFECTS_UNPROVEN")
        }
    }
    static func scene(_ definition: [String: Any], homeId: String) throws {
        guard definition["homeId"] as? String == homeId,
              definition["actionSetType"] as? String == "HMActionSetTypeUserDefined",
              definition["listedInHome"] as? Bool == true,
              definition["actionsTruncated"] as? Bool == false,
              let references = definition["referencedByTriggerIds"] as? [String], references.isEmpty,
              let actions = definition["actions"] as? [[String: Any]], actions.count <= 64,
              definition["actionCount"] as? Int == actions.count else { throw ControlFailure.invalid("SCENE_UNSUPPORTED_OR_REFERENCED") }
        for action in actions {
            guard action["opaque"] as? Bool == false, action["kind"] as? String == "characteristicWrite",
                  let target = action["target"] as? [String: Any], target["resolved"] as? Bool == true,
                  target["homeId"] as? String == homeId,
                  ["accessoryId", "serviceId", "characteristicId"].allSatisfy({ (target[$0] as? String).flatMap(UUID.init(uuidString:)) != nil })
            else { throw ControlFailure.invalid("SCENE_ACTION_UNSUPPORTED_OR_UNRESOLVED") }
        }
    }
}

// Summarize SDK scene observations without implying causal physical completion.
enum SceneReadbackPolicy {
    static func summarize(_ entries: [[String: Any]]) -> [String: Any] {
        let verified = entries.allSatisfy { $0["status"] as? String == "verified" }
        var result: [String: Any] = ["writeAcknowledged": true, "sceneExecutionAcknowledged": true,
            "individualActionsVerified": verified, "actionReadbacks": entries, "valueSource": "fresh-read"]
        if entries.contains(where: { $0["status"] as? String == "mismatch" }) { result["error"] = "READBACK_MISMATCH" }
        else if !verified { result["error"] = "SCENE_READBACK_UNAVAILABLE" }
        return result
    }
}
