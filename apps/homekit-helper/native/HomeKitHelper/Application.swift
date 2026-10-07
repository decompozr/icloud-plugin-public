import Foundation
import HomeKit
import UIKit
import Darwin
import CryptoKit
import CoreFoundation

final class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        HomeKitRuntime.shared.start()
        DesktopPresentation.schedule()
        return true
    }
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let configuration = UISceneConfiguration(name: "Default", sessionRole: connectingSceneSession.role)
        configuration.delegateClass = SceneDelegate.self
        return configuration
    }
}
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
    func sceneDidBecomeActive(_ scene: UIScene) { DesktopPresentation.schedule() }
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard HelperPresentation.showsWindow(CommandLine.arguments), let windowScene = scene as? UIWindowScene else { DesktopPresentation.schedule(); return }
        let controller = UIViewController()
        controller.view.backgroundColor = .systemBackground
        let label = UILabel(frame: CGRect(x: 30, y: 50, width: 550, height: 120))
        label.numberOfLines = 0
        label.text = HomeKitRuntime.shared.controls.controlEnabled
            ? "iCloud HomeKit helper · Control\nDevice controls, scenes and automations are available.\nNotification delivery remains disabled."
            : "iCloud HomeKit helper · Read only\nNative MCP runs over stdin/stdout.\nNo physical controls or notification delivery are enabled."
        controller.view.addSubview(label)
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = controller
        window?.makeKeyAndVisible()
    }
}
