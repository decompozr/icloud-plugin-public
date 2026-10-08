#!/usr/bin/env python3
"""Build via xcodebuild in the current or explicitly selected desktop Terminal session."""
from source_manifest import native_source_manifest
import argparse
import ctypes
import hashlib
import plistlib
import json
import os
from pathlib import Path
import shlex
import signal
import subprocess
import sys
import tempfile
import time


def signing_context():
    security = ctypes.CDLL('/System/Library/Frameworks/Security.framework/Security')
    session = ctypes.c_uint32()
    attributes = ctypes.c_uint32()
    keychain = ctypes.c_void_p()
    status = ctypes.c_uint32()
    security.SessionGetInfo.argtypes = [ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32), ctypes.POINTER(ctypes.c_uint32)]
    security.SecKeychainCopyDefault.argtypes = [ctypes.POINTER(ctypes.c_void_p)]
    security.SecKeychainGetStatus.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint32)]
    session_result = security.SessionGetInfo(0xffffffff, ctypes.byref(session), ctypes.byref(attributes))
    keychain_result = security.SecKeychainCopyDefault(ctypes.byref(keychain))
    if keychain_result == 0:
        keychain_result = security.SecKeychainGetStatus(keychain, ctypes.byref(status))
    return dict(sessionId=session.value, sessionResult=session_result,
                graphicAccess=bool(attributes.value & 0x10), keychainResult=keychain_result,
                keychainUnlocked=bool(status.value & 1), keychainStatus=status.value)


def terminal_parent_pid():
    pid = os.getpid()
    for _ in range(16):
        reply = subprocess.run(['ps', '-p', str(pid), '-o', 'ppid=,comm='], capture_output=True, text=True)
        parts = reply.stdout.strip().split(maxsplit=1)
        if len(parts) != 2:
            break
        if Path(parts[1]).name == 'Terminal':
            return pid
        pid = int(parts[0])
        if pid <= 1:
            break
    return None


def prepare_isolated_terminal(run):
    context = run / 'desktop-launch.json'
    if not context.exists():
        return None
    before = json.loads(context.read_text())['existingTerminalPids']
    pid = terminal_parent_pid()
    if not pid or pid in before:
        raise RuntimeError('An isolated task-owned Terminal instance is required')
    script = 'ObjC.import("AppKit"); var app=$.NSRunningApplication.runningApplicationWithProcessIdentifier(' + str(pid) + '); app.hide; app.isHidden;'
    hidden = subprocess.run(['/usr/bin/osascript', '-l', 'JavaScript', '-e', script], capture_output=True, text=True, timeout=10)
    deadline = time.monotonic() + 2
    while hidden.returncode == 0 and hidden.stdout.strip() != 'true' and time.monotonic() < deadline:
        time.sleep(.05)
        hidden = subprocess.run(['/usr/bin/osascript', '-l', 'JavaScript', '-e', script], capture_output=True, text=True, timeout=10)
    if hidden.returncode != 0 or hidden.stdout.strip() != 'true':
        raise RuntimeError('Task-owned Terminal did not remain hidden')
    (run / 'presentation.json').write_text(json.dumps(dict(launchHidden=True, terminalInstancePID=pid, otherTerminalWindowsChanged=False), indent=2) + '\n')
    return pid


def close_isolated_terminal(run, result):
    context = json.loads((run / 'desktop-launch.json').read_text())
    pid = result.get('terminalInstancePID')
    if not isinstance(pid, int) or pid in context['existingTerminalPids']:
        raise RuntimeError('Task-owned Terminal identity unavailable; preserve it')
    command = subprocess.run(['ps', '-p', str(pid), '-o', 'comm='], capture_output=True, text=True).stdout.strip()
    if command and Path(command).name != 'Terminal':
        raise RuntimeError('Task-owned Terminal identity changed; preserve it')
    if command:
        os.kill(pid, signal.SIGTERM)
    return dict(status='terminated-owned-instance', terminalInstancePID=pid, existingTerminalPidsPreserved=context['existingTerminalPids'])


def build(run, configuration="Debug"):
    terminal_pid = prepare_isolated_terminal(run)
    context = signing_context()
    (run / 'context.json').write_text(json.dumps(context, indent=2) + '\n')
    project = Path(__file__).resolve().parent / 'native/HomeKitHelper.xcodeproj'
    manifest = native_source_manifest()
    source_sha = manifest['sourceSHA256']
    source_head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=project.parent, capture_output=True, text=True).stdout.strip()
    command = ['xcodebuild', '-project', str(project), '-scheme', 'HomeKitHelper',
               '-configuration', configuration, '-destination', 'platform=macOS,variant=Mac Catalyst',
               '-derivedDataPath', str(run / 'DerivedData'), '-allowProvisioningUpdates',
               '-allowProvisioningDeviceRegistration', f'HOMEKIT_SOURCE_SHA256={source_sha}', 'build']
    env = dict(os.environ, DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer')
    result = dict(context=context, terminalInstancePID=terminal_pid, state='building', runnerPid=os.getpid(), physicalWrites=0, configuration=configuration, sourceSHA256=source_sha, sourceHEAD=source_head, sourceManifest=manifest['files'])
    (run / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    with (run / 'build.log').open('w') as log:
        completed = subprocess.run(command, env=env, stdout=log, stderr=subprocess.STDOUT)
    app = run / ('DerivedData/Build/Products/' + configuration + '-maccatalyst/HomeKitHelper.app')
    verified = False
    if completed.returncode == 0:
        with (run / 'verification.log').open('w') as log:
            verified = subprocess.run(['codesign', '--verify', '--strict', str(app)],
                                      stdout=log, stderr=subprocess.STDOUT).returncode == 0
    source_unchanged = native_source_manifest()['sourceSHA256'] == source_sha
    embedded_sha = None
    if completed.returncode == 0:
        embedded_sha = plistlib.loads((app / 'Contents/Info.plist').read_bytes()).get('HomeKitSourceSHA256')
    verified = verified and source_unchanged and embedded_sha == source_sha
    result.update(sourceUnchanged=source_unchanged, embeddedSourceSHA256=embedded_sha, state='succeeded' if verified else 'failed', buildExit=completed.returncode,
                  signatureVerified=verified, app=str(app))
    pending = run / 'result.pending.json'
    pending.write_text(json.dumps(result, indent=2) + '\n')
    pending.replace(run / 'result.json')
    print(json.dumps(result), flush=True)
    return 0 if verified else 1



def quiet_terminal_available():
    """Inspect without opening Terminal or changing another user's windows."""
    running = subprocess.run(['pgrep', '-x', 'Terminal'], capture_output=True, text=True)
    if running.returncode == 1:
        return True
    if running.returncode != 0:
        raise RuntimeError('Cannot inspect the desktop Terminal context')
    count = subprocess.run(['/usr/bin/osascript', '-e', 'tell application id "com.apple.Terminal" to count windows'], capture_output=True, text=True, timeout=10)
    if count.returncode != 0 or not count.stdout.strip().isdigit():
        raise RuntimeError('Cannot inspect Terminal windows; no GUI build launched')
    return int(count.stdout.strip()) == 0


def hide_task_terminal(run):
    """Hide only the single task window identified by its exact launcher path."""
    launcher = str(run / 'build.command')
    script = r"""
on run argv
 tell application id "com.apple.Terminal"
  repeat with wi from (count of windows) to 1 by -1
   if (name of window wi) contains (item 1 of argv) and (count of tabs of window wi) is 1 then
    set visible of window wi to false
    return id of window wi
   end if
  end repeat
 end tell
 return ""
end run
"""
    result = subprocess.run(['/usr/bin/osascript', '-e', script, launcher], capture_output=True, text=True, timeout=10)
    if result.returncode != 0:
        raise RuntimeError('Task-only Terminal hide failed; retain the build receipt')
    return result.stdout.strip()


def close_completed_terminal(run):
    """Close only a finished single-tab window with this run's exact launcher path."""
    launcher = str(run / 'build.command')
    alias = launcher.replace('/private/tmp/', '/tmp/', 1) if launcher.startswith('/private/tmp/') else launcher
    script = r"""
on run argv
 tell application "Terminal"
  set report to ""
  repeat with attempt from 1 to 20
   repeat with wi from (count of windows) to 1 by -1
    set taskTitle to name of window wi
    if (taskTitle contains item 1 of argv) or (taskTitle contains item 2 of argv) then
     if (count of tabs of window wi) is 1 then
      set tabText to contents of tab 1 of window wi
      if tabText contains "[Process completed]" and not (busy of tab 1 of window wi) then
       set targetId to id of window wi
       close window id targetId
       set report to report & (targetId as text) & linefeed
      end if
     end if
    end if
   end repeat
   if report is not "" then return report
   delay 0.1
  end repeat
  return report
 end tell
end run
"""
    try:
        completed = subprocess.run(['osascript', '-', launcher, alias], input=script,
                                   capture_output=True, text=True, timeout=8)
        closed = [int(value) for value in completed.stdout.splitlines() if value.strip().isdigit()]
        cleanup = dict(status='closed' if closed else 'retained', windowIds=closed,
                       automationExit=completed.returncode)
        if completed.returncode:
            cleanup['reason'] = completed.stderr.strip()[:500]
    except (OSError, subprocess.TimeoutExpired) as error:
        cleanup = dict(status='retained', reason=str(error)[:500])
    (run / 'terminal-cleanup.json').write_text(json.dumps(cleanup, indent=2) + '\n')
    return cleanup

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', help='Private artifact root; each build creates a unique run directory')
    parser.add_argument('--desktop-session', action='store_true',
                        help='Run xcodebuild in a hidden task-only desktop Terminal; in an isolated hidden Terminal instance')
    parser.add_argument('--configuration', choices=['Debug','Release'], default='Debug')
    parser.add_argument('--worker-directory', help=argparse.SUPPRESS)
    args = parser.parse_args()
    os.umask(0o077)
    if args.worker_directory:
        return build(Path(args.worker_directory), args.configuration)
    if not args.output:
        parser.error('--output is required')
    context = signing_context()
    if not context['graphicAccess'] and not args.desktop_session:
        print('This background session has no GUI keychain context. Run in Terminal, or add --desktop-session.', file=sys.stderr)
        return 1
    use_current_desktop = context['graphicAccess'] and context['keychainUnlocked']
    root = Path(args.output).resolve()
    root.mkdir(parents=True, mode=0o700, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix='build-', dir=root))
    print(f'Private build artifacts: {run}', flush=True)
    if not args.desktop_session or use_current_desktop:
        return build(run, args.configuration)
    # Launch Services starts Terminal in the existing logged-in user session.
    # No password, key ACL, trust setting, launch agent or global preference is changed.
    launcher = run / 'build.command'
    worker = ['/usr/bin/python3', str(Path(__file__).resolve()), '--worker-directory', str(run), '--configuration', args.configuration]
    launcher.write_text('#!/bin/zsh\numask 077\nexec ' + shlex.join(worker) + '\n')
    launcher.chmod(0o700)
    existing = subprocess.run(['pgrep', '-x', 'Terminal'], capture_output=True, text=True)
    if existing.returncode not in [0, 1]:
        raise RuntimeError('Cannot inspect existing Terminal instances')
    baseline = [int(value) for value in existing.stdout.split()]
    (run / 'desktop-launch.json').write_text(json.dumps(dict(existingTerminalPids=baseline, isolatedTaskInstance=True)) + '\n')
    subprocess.run(['open', '-g', '-j', '-n', '-a', 'Terminal', str(launcher)], check=True)
    deadline = time.monotonic() + 600
    last_update = 0
    while time.monotonic() < deadline:
        receipt = run / 'result.json'
        if receipt.exists():
            try:
                result = json.loads(receipt.read_text())
            except json.JSONDecodeError:
                result = {}
            if result.get('state') in ['succeeded', 'failed']:
                result['terminalCleanup'] = close_isolated_terminal(run, result)
                receipt.write_text(json.dumps(result, indent=2) + '\n')
                print(json.dumps(result), flush=True)
                return 0 if result['state'] == 'succeeded' else 1
        if time.monotonic() - last_update > 30:
            print('Waiting for desktop CLI build; evidence retained in ' + str(run), flush=True)
            last_update = time.monotonic()
        time.sleep(.5)
    print('Build wait expired; inspect the retained log and Terminal prompt. No automatic retry.', file=sys.stderr)
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
