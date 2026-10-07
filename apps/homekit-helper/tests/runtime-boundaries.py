#!/usr/bin/env python3
"""Compile the exact Foundation-only launch/framing contracts; no Home/device I/O."""
from pathlib import Path
import subprocess,tempfile,os
root=Path('apps/homekit-helper/native/HomeKitHelper')
source='\n'.join((root/name).read_text() for name in ['ControlPolicy.swift','LaunchConfiguration.swift','JSONRPCTransport.swift'])
checks=r'''
func check(_ condition: @autoclosure () throws -> Bool) throws { precondition(try condition()) }
func denied(_ args: [String]) { do { _ = try LaunchConfiguration(arguments: args); fatalError("Launch should deny") } catch {} }
let home = "00000000-0000-4000-8000-000000000001"
let idle = try LaunchConfiguration(arguments: []); precondition(idle.mode == .idle && idle.isReadOnly)
denied(["helper","--production-controls"]); denied(["helper","--read-only"])
denied(["helper","--mode","control"]); denied(["helper","--mode","read"])
denied(["helper","--mode","control","--home-id",home]); denied(["helper","--mode","read","--home-id","name"])
denied(["helper","--mode","control","--home-id",home,"--lifecycle-directory","relative"])
denied(["helper","--mode","read","--home-id",home,"--lifecycle-directory","/private/fixture"])
denied(["helper","--mode","control","--mode","read","--home-id",home,"--lifecycle-directory","/private/fixture"])
let control = try LaunchConfiguration(arguments: ["helper","--mode","control","--home-id",home,"--lifecycle-directory","/private/fixture"])
precondition(control.mode == .control && !control.isReadOnly && control.homeId == home)
let enrollment = try LaunchConfiguration(arguments: ["helper","--mode","enrollment"]); precondition(enrollment.isReadOnly && enrollment.homeId == nil)
var decoder = RPCFrameDecoder(); precondition(try decoder.append(Data("{\"jsonrpc\":\"2.0\",\"id\":1,".utf8)).isEmpty)
let frames = try decoder.append(Data("\"method\":\"ping\"}\n".utf8)); precondition(frames.count == 1 && !decoder.partial)
let request = try JSONRPCTransport.request(frames[0]); precondition(request["method"] as? String == "ping")
var oversized = RPCFrameDecoder(); do { _ = try oversized.append(Data(repeating: 65,count:65537)); fatalError("Oversize accepted") } catch {}
for text in ["{}", "{\"jsonrpc\":\"2.0\",\"method\":\"ping\",\"id\":true}", "{\"jsonrpc\":\"2.0\",\"method\":\"ping\",\"params\":[]}"] {
 do { _ = try JSONRPCTransport.request(Data(text.utf8)); fatalError("Malformed request accepted") } catch {}
}
print("19 production launch/framing checks passed; no HomeKit/device I/O")
'''
# Swift assertions cannot throw inside precondition's nonthrowing autoclosure.
checks=checks.replace('precondition(try condition())','let value = try condition(); precondition(value)').replace('precondition(try decoder.append','try check(try decoder.append')
with tempfile.TemporaryDirectory(prefix='homekit-runtime-boundaries-') as folder:
 p=Path(folder)/'checks.swift';p.write_text(source+'\n'+checks)
 subprocess.run(['xcrun','swift',str(p)],check=True,env=dict(os.environ,DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer'))
