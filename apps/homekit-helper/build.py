#!/usr/bin/env python3
"""Build via xcodebuild in the current or explicitly selected desktop Terminal session."""
import argparse
import ctypes
import hashlib
import plistlib
import json
import os
from pathlib import Path
import shlex
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


def build(run):
    context = signing_context()
    (run / 'context.json').write_text(json.dumps(context, indent=2) + '\n')
    project = Path(__file__).resolve().parent / 'native/HomeKitProbe.xcodeproj'
    source = project.parent / 'HomeKitProbe/main.swift'
    source_sha = hashlib.sha256(source.read_bytes()).hexdigest()
    source_head = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=project.parent, capture_output=True, text=True).stdout.strip()
    command = ['xcodebuild', '-project', str(project), '-scheme', 'HomeKitProbe',
               '-configuration', 'Debug', '-destination', 'platform=macOS,variant=Mac Catalyst',
               '-derivedDataPath', str(run / 'DerivedData'), '-allowProvisioningUpdates',
               '-allowProvisioningDeviceRegistration', f'HOMEKIT_SOURCE_SHA256={source_sha}', 'build']
    env = dict(os.environ, DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer')
    result = dict(context=context, state='building', runnerPid=os.getpid(), physicalWrites=0, sourceSHA256=source_sha, sourceHEAD=source_head)
    (run / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
    with (run / 'build.log').open('w') as log:
        completed = subprocess.run(command, env=env, stdout=log, stderr=subprocess.STDOUT)
    app = run / 'DerivedData/Build/Products/Debug-maccatalyst/HomeKitProbe.app'
    verified = False
    if completed.returncode == 0:
        with (run / 'verification.log').open('w') as log:
            verified = subprocess.run(['codesign', '--verify', '--strict', str(app)],
                                      stdout=log, stderr=subprocess.STDOUT).returncode == 0
    source_unchanged = hashlib.sha256(source.read_bytes()).hexdigest() == source_sha
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
                        help='Run xcodebuild in a new desktop Terminal window through Launch Services')
    parser.add_argument('--worker-directory', help=argparse.SUPPRESS)
    args = parser.parse_args()
    os.umask(0o077)
    if args.worker_directory:
        return build(Path(args.worker_directory))
    if not args.output:
        parser.error('--output is required')
    context = signing_context()
    if not context['graphicAccess'] and not args.desktop_session:
        print('This background session has no GUI keychain context. Run in Terminal, or add --desktop-session.', file=sys.stderr)
        return 1
    root = Path(args.output).resolve()
    root.mkdir(parents=True, mode=0o700, exist_ok=True)
    run = Path(tempfile.mkdtemp(prefix='build-', dir=root))
    print(f'Private build artifacts: {run}', flush=True)
    if not args.desktop_session:
        return build(run)
    # Launch Services starts Terminal in the existing logged-in user session.
    # No password, key ACL, trust setting, launch agent or global preference is changed.
    launcher = run / 'build.command'
    worker = ['/usr/bin/python3', str(Path(__file__).resolve()), '--worker-directory', str(run)]
    launcher.write_text('#!/bin/zsh\numask 077\nexec ' + shlex.join(worker) + '\n')
    launcher.chmod(0o700)
    subprocess.run(['open', '-g', '-a', 'Terminal', str(launcher)], check=True)
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
                result['terminalCleanup'] = close_completed_terminal(run)
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
