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
precondition(name.contains("Office Light On") && name.contains(operation) && !name.contains("Test"))
denied{_ = try LifecycleStore.resourceName(" ",operationId:operation)}
denied{_ = try LifecycleStore.resourceName("Name",operationId:"name")}
precondition(SceneReadbackPolicy.summarize([["status":"verified"]])["individualActionsVerified"] as? Bool == true)
precondition(SceneReadbackPolicy.summarize([["status":"mismatch"]])["error"] as? String == "READBACK_MISMATCH")
precondition(SceneReadbackPolicy.summarize([["status":"read_failed"]])["error"] as? String == "SCENE_READBACK_UNAVAILABLE")
precondition(SceneReadbackPolicy.summarize([["status":"unreadable"],["status":"verified"]])["individualActionsVerified"] as? Bool == false)
print("22 exact scene/provider/naming/readback checks passed; physical writes 0")
''')
 subprocess.run(['xcrun','swift',str(p)],check=True,env=dict(os.environ,DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer'))
