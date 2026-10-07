import AppKit
import CoreGraphics
let pid=pid_t(CommandLine.arguments[1])!
let app=NSRunningApplication(processIdentifier:pid)
let owned=(CGWindowListCopyWindowInfo([.optionAll,.excludeDesktopElements],kCGNullWindowID) as? [[String:Any]] ?? []).filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid }
let visible=owned.filter { ($0[kCGWindowLayer as String] as? NSNumber)?.intValue == 0 && ($0[kCGWindowIsOnscreen as String] as? Bool)==true }
let result:[String:Any]=["runningApplicationFound":app != nil,"activationPolicy":app.map{$0.activationPolicy.rawValue} ?? -1,"ownedVisibleWindowCount":visible.count]
print(String(data:try JSONSerialization.data(withJSONObject:result,options:[.sortedKeys]),encoding:.utf8)!)
