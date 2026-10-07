import Foundation
import UIKit
import ObjectiveC
// BEGIN PRESENTATION SUPPORT -- Foundation-only launch policy.
enum HelperPresentation {
    static func showsWindow(_ arguments: [String]) -> Bool { arguments.contains("--show-window") }
}
// END PRESENTATION SUPPORT

// Catalyst does not expose AppKit at compile time. Only documented public selectors
// cross this narrow desktop presentation boundary; HomeKit stays in UIKit.
enum DesktopPresentation {
    static func apply() {
        guard !HelperPresentation.showsWindow(CommandLine.arguments),
              let appClass = NSClassFromString("NSApplication"),
              let shared = class_getClassMethod(appClass, NSSelectorFromString("sharedApplication")) else { return }
        typealias Shared = @convention(c) (AnyClass, Selector) -> Unmanaged<AnyObject>
        let app = unsafeBitCast(method_getImplementation(shared), to: Shared.self)(appClass, NSSelectorFromString("sharedApplication")).takeUnretainedValue()
        guard let actualClass = object_getClass(app) else { return }
        if let policy = class_getInstanceMethod(actualClass, NSSelectorFromString("setActivationPolicy:")) {
            typealias Policy = @convention(c) (AnyObject, Selector, Int) -> Bool
            _ = unsafeBitCast(method_getImplementation(policy), to: Policy.self)(app, NSSelectorFromString("setActivationPolicy:"), 1)
        }
        // Catalyst's host window ignores orderOut. Hide the application only once
        // Home access is granted, so initial macOS permission UI remains available.
        if HomeKitRuntime.shared.homeAuthorized, let hide = class_getInstanceMethod(actualClass, NSSelectorFromString("hide:")) {
            typealias Hide = @convention(c) (AnyObject, Selector, AnyObject?) -> Void
            unsafeBitCast(method_getImplementation(hide), to: Hide.self)(app, NSSelectorFromString("hide:"), nil)
        }
    }

    static func schedule() {
        DispatchQueue.main.async { apply() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { apply() }
    }
}
