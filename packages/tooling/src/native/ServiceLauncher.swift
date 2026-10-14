import Foundation
import Security
import Darwin

// Remain the responsible App while the fixed, sealed runtime supervises Studio.
@main struct ServiceLauncher {
 static func main() {
  let args=CommandLine.arguments
  guard args.count == 5, args[1] == "run", args[2] == "--prefix", args[4] == "--no-open", args[3].hasPrefix("/") else { exit(64) }
  let app=URL(fileURLWithPath: args[0]).resolvingSymlinksInPath().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
  var code: SecStaticCode?
  var requirement: SecRequirement?
  #if SERVICE_APP_TESTING
  guard SecStaticCodeCreateWithPath(app as CFURL, [], &code) == errSecSuccess,
        let code, SecStaticCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSCheckAllArchitectures), nil) == errSecSuccess else { exit(65) }
  #else
  guard SecStaticCodeCreateWithPath(app as CFURL, [], &code) == errSecSuccess,
        SecRequirementCreateWithString("anchor apple generic and certificate leaf[subject.OU] = \"74NBML8KJB\" and identifier \"com.decompozr.studio-service\"" as CFString, [], &requirement) == errSecSuccess,
        let code, SecStaticCodeCheckValidity(code, SecCSFlags(rawValue: kSecCSCheckAllArchitectures), requirement) == errSecSuccess else { exit(65) }
  #endif
  let prefix=URL(fileURLWithPath: args[3]).resolvingSymlinksInPath()
  let release=app.deletingLastPathComponent()
  let releases=release.deletingLastPathComponent()
  guard releases.lastPathComponent == "releases", releases.deletingLastPathComponent().path == prefix.path else { exit(66) }
  do {
   let attributes=try FileManager.default.attributesOfItem(atPath: prefix.path)
   guard (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
         (attributes[.posixPermissions] as? NSNumber)?.intValue == 0o700,
         try String(contentsOf:prefix.appendingPathComponent(".icloud-install"),encoding:.utf8) == "{\"format\":1,\"owner\":\"icloud-plugin-install\"}" else { exit(66) }
  } catch { exit(66) }
  let resources=app.appendingPathComponent("Contents/Resources")
  let child=Process()
  child.executableURL=resources.appendingPathComponent("bun")
  child.arguments=["--no-env-file","--config=/dev/null",resources.appendingPathComponent("payload/icloud-plugin.js").path,"run","--prefix",prefix.path,"--no-open"]
  child.currentDirectoryURL=resources.appendingPathComponent("payload")
  var environment=["PATH":"/usr/bin:/bin:/usr/sbin:/sbin","HOME":NSHomeDirectory(),"USER":NSUserName(),"LOGNAME":NSUserName(),"LC_ALL":"C","ICLOUD_SERVICE_LAUNCHER_PID":String(getpid()),"ICLOUD_SERVICE_APP":app.path]
  if let tmp=ProcessInfo.processInfo.environment["TMPDIR"] { environment["TMPDIR"]=tmp }
  child.environment=environment
  child.standardInput=FileHandle.nullDevice;child.standardOutput=FileHandle.standardOutput;child.standardError=FileHandle.standardError
  signal(SIGTERM,SIG_IGN);signal(SIGINT,SIG_IGN)
  let term=DispatchSource.makeSignalSource(signal:SIGTERM,queue:.global())
  let interrupt=DispatchSource.makeSignalSource(signal:SIGINT,queue:.global())
  let stopping=NSLock()
  var stopSignal:Int32=0
  term.setEventHandler { stopping.lock();stopSignal=SIGTERM;stopping.unlock();if child.isRunning { kill(child.processIdentifier,SIGTERM) } }
  interrupt.setEventHandler { stopping.lock();stopSignal=SIGINT;stopping.unlock();if child.isRunning { kill(child.processIdentifier,SIGINT) } }
  term.resume();interrupt.resume()
  do { try child.run();stopping.lock();let pending=stopSignal;stopping.unlock();if pending != 0 { kill(child.processIdentifier,pending) };child.waitUntilExit();exit(child.terminationStatus) } catch { exit(70) }
 }
}
