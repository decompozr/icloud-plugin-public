#!/usr/bin/env python3
"""Exercise the exact Foundation-only production scene policy; no HomeKit I/O."""
from pathlib import Path
import subprocess,tempfile,os
root=Path('apps/homekit-helper/native/HomeKitHelper')
policy=(root/'ControlPolicy.swift').read_text()+'\n'+(root/'OperationJournal.swift').read_text()
with tempfile.TemporaryDirectory(prefix='homekit-production-policy-',dir='/tmp') as root:
 p=Path(root)/'test.swift'
 p.write_text('import Foundation\nimport CoreFoundation\nimport Darwin\n'+policy+r'''
let home = "00000000-0000-4000-8000-000000000001"
let id = "00000000-0000-4000-8000-000000000002"
let target: [String: Any] = ["homeId": home, "resolved": true, "accessoryId": id, "serviceId": id, "characteristicId": id]
let action: [String: Any] = ["kind": "characteristicWrite", "opaque": false, "target": target]
let scene: [String: Any] = ["homeId": home, "actionSetType": "HMActionSetTypeUserDefined", "listedInHome": true,
    "actionsTruncated": false, "referencedByTriggerIds": [String](), "actions": [action], "actionCount": 1]
try ProductionControlPolicy.scene(scene, homeId: home)
try ProductionControlPolicy.existingScene(scene, homeId: home)
var empty = scene; empty["actions"] = [[String: Any]](); empty["actionCount"] = 0
do { try ProductionControlPolicy.existingScene(empty, homeId: home); fatalError("Empty existing effects accepted") } catch {}
func deny(_ change: [String: Any]) {
 var value = scene; value.merge(change, uniquingKeysWith: { _, new in new })
 do { try ProductionControlPolicy.scene(value, homeId: home); fatalError("Expected denial") } catch {}
}
deny(["homeId": id]); deny(["actionSetType": "HMActionSetTypeTriggerOwned"])
deny(["listedInHome": false]); deny(["actionsTruncated": true]); deny(["referencedByTriggerIds": [id]])
deny(["actionCount": 2]); deny(["actions": Array(repeating: action, count: 65), "actionCount": 65])
var opaque = action; opaque["opaque"] = true; deny(["actions": [opaque]])
var unresolved = target; unresolved["resolved"] = false
var badAction = action; badAction["target"] = unresolved; deny(["actions": [badAction]])
unresolved = target; unresolved["homeId"] = id; badAction["target"] = unresolved; deny(["actions": [badAction]])
unresolved = target; unresolved["characteristicId"] = "name"; badAction["target"] = unresolved; deny(["actions": [badAction]])
func assertion(_ test: @autoclosure () throws -> Bool) throws { let result = try test(); precondition(result) }
let journalURL = URL(fileURLWithPath: CommandLine.arguments[1]).appendingPathComponent("controls.jsonl")
let journal = try ControlJournal(url: journalURL)
let request: [String: Any] = ["tool": "homekit_write", "arguments": ["homeId": home, "operationId": id, "value": true]]
try assertion(try journal.outcome(operationId: id, request: request) == nil)
try assertion(try journal.begin(operationId: id, request: request) == nil)
try assertion(try journal.begin(operationId: id, request: request)?["error"] as? String == "WRITE_OUTCOME_UNKNOWN")
try journal.finish(operationId: id, request: request, result: ["error": "READBACK_MISMATCH", "observed": false])
try assertion(try journal.outcome(operationId: id, request: request)?["error"] as? String == "READBACK_MISMATCH")
try assertion(try journal.begin(operationId: id, request: request)?["observed"] as? Bool == false)
do { _ = try journal.begin(operationId: id, request: ["different": true]); fatalError("Conflict accepted") } catch {}
let large = Array(repeating: "{\"operationId\":\"other\"}\n", count: 50000).joined()
let handle = try FileHandle(forWritingTo: journalURL); try handle.seekToEnd(); try handle.write(contentsOf: Data(large.utf8)); try handle.close()
try assertion(try journal.outcome(operationId: id, request: request)?["error"] as? String == "READBACK_MISMATCH")
let broken = try FileHandle(forWritingTo: journalURL); try broken.seekToEnd(); try broken.write(contentsOf: Data("partial".utf8)); try broken.close()
do { _ = try journal.begin(operationId: "new", request: request); fatalError("Partial journal accepted") } catch {}
print("22 exact native production control/journal checks passed; physical writes 0")
''')
 subprocess.run(['xcrun','swift',str(p),root],check=True,env=dict(os.environ,DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer'))
