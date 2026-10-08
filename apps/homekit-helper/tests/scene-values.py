#!/usr/bin/env python3
"""Exact Foundation-only provider scene/readback policy checks; no HomeKit I/O."""
from pathlib import Path
import subprocess,tempfile,os
native=Path('apps/homekit-helper/native/HomeKitHelper')
source=(native/'ControlPolicy.swift').read_text()+'\n'+(native/'ResourceLedger.swift').read_text()
with tempfile.TemporaryDirectory(prefix='homekit-scene-values-') as directory:
 p=Path(directory)/'main.swift'
 p.write_text(source+r'''
let home="00000000-0000-4000-8000-000000000001"
let operation="00000000-0000-4000-8000-000000000002"
let target:[String:Any]=["homeId":home,"accessoryId":operation,"serviceId":operation,"characteristicId":operation,"resolved":true,"format":"bool"]
var action:[String:Any]=["id":operation,"kind":"characteristicWrite","opaque":false,"target":target,"targetValue":NSNumber(value:1)]
func check(_ condition:@autoclosure () throws -> Bool) throws { let result=try condition();precondition(result) }
func denied(_ body:() throws -> Void){do{try body();fatalError("Expected denial")}catch{}}
try check(try ControlValue.decodeProviderTarget(NSNumber(value:1),format:"bool") as? Bool == true)
try check(try ControlValue.decodeProviderTarget(NSNumber(value:0),format:"bool") as? Bool == false)
try check(try ControlValue.decodeProviderTarget(true,format:"bool") as? Bool == true)
denied{_ = try ControlValue.decode(NSNumber(value:1),format:"bool")}
denied{_ = try ControlValue.decodeProviderTarget(NSNumber(value:2),format:"bool")}
denied{_ = try ControlValue.decodeProviderTarget("1",format:"bool")}
denied{_ = try ControlValue.decodeProviderTarget(true,format:"uint8")}
try check(try ControlValue.decodeProviderTarget(NSNumber(value:1),format:"uint8") as? NSNumber == NSNumber(value:1))
try check(try LifecycleStore.actionMatches(action,target:target,value:true))
try check(try !LifecycleStore.actionMatches(action,target:target,value:false))
denied{_ = try LifecycleStore.actionMatches(action,target:target,value:NSNumber(value:1))}
var foreign=target;foreign["homeId"]=operation;action["target"]=foreign
try check(try !LifecycleStore.actionMatches(action,target:target,value:true))
foreign=target;foreign["format"]="uint8";action["target"]=foreign
try check(try !LifecycleStore.actionMatches(action,target:target,value:true))
action["target"]=target
try check(try LifecycleStore.addedAction([action],baseline:[],target:target,value:true)==operation)
denied{_ = try LifecycleStore.addedAction([action,action],baseline:[],target:target,value:true)}
let name=try LifecycleStore.resourceName("Office Light On",operationId:operation)
precondition(name.contains("Office Light On") && name.contains(operation) && !name.contains("Test") && name.hasSuffix(operation) && !name.contains("]"))
denied{_ = try LifecycleStore.resourceName(" ",operationId:operation)}
denied{_ = try LifecycleStore.resourceName("Name",operationId:"name")}
precondition(SceneReadbackPolicy.summarize([["status":"verified"]])["individualActionsVerified"] as? Bool == true)
precondition(SceneReadbackPolicy.summarize([["status":"mismatch"]])["error"] as? String == "READBACK_MISMATCH")
precondition(SceneReadbackPolicy.summarize([["status":"read_failed"]])["error"] as? String == "SCENE_READBACK_UNAVAILABLE")
precondition(SceneReadbackPolicy.summarize([["status":"unreadable"],["status":"verified"]])["individualActionsVerified"] as? Bool == false)
let thermostatStep = NSNumber(value: Float(0.1))
let thermostatValue = try ControlValue.decode(23, format: "float", minimum: 9, maximum: 32, step: thermostatStep)
precondition((thermostatValue as? NSNumber)?.doubleValue == 23)
denied{_ = try ControlValue.decode(23.05, format: "float", minimum: 9, maximum: 32, step: thermostatStep)}
denied{_ = try ControlValue.decode(33, format: "float", minimum: 9, maximum: 32, step: thermostatStep)}
denied{_ = try ControlValue.decode(23, format: "uint8", minimum: 9, maximum: 32, step: thermostatStep)}
let productionName = try LifecycleStore.resourceName("Daily Heat", operationId: operation)
let candidate: [String: Any] = ["id": operation, "homeId": home, "name": productionName, "kind": "event", "enabled": false, "sceneIds": [String](), "events": [[String: Any]]()]
let submitted: [String: Any] = ["id": home, "homeId": home, "name": productionName]
var creationRecords: [[String: Any]] = [
 ["phase": "before-add-trigger", "operationId": operation, "homeId": home, "definition": submitted, "baselineTriggerIds": [String]()],
 ["phase": "add-trigger-completion", "operationId": operation, "homeId": home, "definition": submitted, "baselineTriggerIds": [String](), "callbackError": NSNull()],
 ["phase": "independent-manager-readback", "operationId": operation, "homeId": home, "newDefinitions": [candidate], "baselineTriggerIds": [String]()]]
try check(try LifecycleStore.creationCandidate(records: creationRecords, homeId: home, operationId: operation)["id"] as? String == operation)
denied{_ = try LifecycleStore.creationCandidate(records: Array(creationRecords.prefix(2)), homeId: home, operationId: operation)}
var ambiguous = creationRecords; ambiguous[2]["newDefinitions"] = [candidate, candidate]
denied{_ = try LifecycleStore.creationCandidate(records: ambiguous, homeId: home, operationId: operation)}
var prior = creationRecords; for i in prior.indices { prior[i]["baselineTriggerIds"] = [operation] }
denied{_ = try LifecycleStore.creationCandidate(records: prior, homeId: home, operationId: operation)}
denied{_ = try LifecycleStore.creationCandidate(records: creationRecords, homeId: operation, operationId: operation)}
var legacy = creationRecords; var oldSubmitted = submitted; oldSubmitted["name"] = "DecompozR Test \(operation) Daily Heat"; legacy[0]["definition"] = oldSubmitted; legacy[1]["definition"] = oldSubmitted
var oldCandidate = candidate; oldCandidate["name"] = oldSubmitted["name"]; legacy[2]["newDefinitions"] = [oldCandidate]
denied{_ = try LifecycleStore.creationCandidate(records: legacy, homeId: home, operationId: operation)}
print("32 exact scene/provider/creation-proof/Float32 checks passed; physical writes 0")
''')
 subprocess.run(['xcrun','swift',str(p)],check=True,env=dict(os.environ,DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer'))
