#!/usr/bin/env python3
"""Local agent stdio adapter for the signed Catalyst experiment app."""
import plistlib
import json
import argparse
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import threading
import time

def owned_native_command(text, executable, pid_file, journal):
    # LaunchServices consumes --stdin; session ownership lives in --args instead.
    return text.startswith(str(executable)+' ') and str(pid_file) in text and str(journal) in text

parser=argparse.ArgumentParser()
parser.add_argument('--app',required=True)
parser.add_argument('--state-directory',required=True)
parser.add_argument('--lifecycle-directory',help='Explicit private task-owned disabled lifecycle mode; hides physical controls')
parser.add_argument('--production-controls',action='store_true',help='Explicit revision-checked controls with the scoped lifecycle ledger')
parser.add_argument('--mode',choices=['enrollment','read','definitions','control'])
parser.add_argument('--home-id',help='Exact enrolled Home for all non-enrollment modes')
parser.add_argument('--read-only',action='store_true',help='Disable all physical controls')
args=parser.parse_args()
if args.read_only and args.lifecycle_directory:parser.error("Read-only and lifecycle modes require separate runs")
if args.production_controls and (args.read_only or not args.lifecycle_directory):parser.error("Production controls require scoped lifecycle mode")
os.umask(0o077)
app=Path(args.app).resolve()
info=plistlib.loads((app/'Contents/Info.plist').read_bytes())
name=info.get('CFBundleExecutable')
if name not in ['HomeKitProbe','HomeKitHelper']:raise SystemExit('Supported signed HomeKit executable required')
executable=app/'Contents/MacOS'/name
if not executable.is_file():raise SystemExit('Signed HomeKit helper app required')
mode=args.mode
if not mode:
    mode=('read' if args.home_id else 'enrollment') if args.read_only else ('control' if args.production_controls else 'definitions') if args.lifecycle_directory else 'enrollment'
if info.get('HomeKitProtocolVersion')=='1.0.0':
 if mode!='enrollment' and not args.home_id:parser.error('Exact enrolled Home required')
 native_mode=['--mode',mode,*(['--home-id',args.home_id] if args.home_id else []),*(['--lifecycle-directory',str(Path(args.lifecycle_directory).resolve())] if args.lifecycle_directory else [])]
else:
 native_mode=[*(['--read-only'] if mode in ['read','enrollment'] else []),*(['--lifecycle-directory',str(Path(args.lifecycle_directory).resolve())] if args.lifecycle_directory else []),*(['--production-controls'] if mode=='control' else [])]
subprocess.run(['codesign','--verify','--strict',str(app)],check=True)
root=Path(args.state_directory);root.mkdir(mode=0o700,parents=True,exist_ok=True)
session=Path(tempfile.mkdtemp(prefix='agent-',dir=root))
fifo=session/'stdin.fifo';os.mkfifo(fifo,0o600)
input_stream=os.fdopen(os.open(fifo,os.O_RDWR),'w',buffering=1)
output=session/'stdout.jsonl';output.write_text('')
pid_file=session/'native.pid'
# Bound background calls launch hidden before Catalyst can present its host window.
# Explicit enrollment retains the normal system Home-data permission ceremony.
launcher=subprocess.Popen(['open','-g',*(['-j'] if mode!='enrollment' else []),'-W','-n','-a',str(app),'--stdin',str(fifo),'--stdout',str(output),
    '--stderr',str(session/'native-stderr.log'),'--args','--event-journal',str(session/'events.jsonl'),
    '--pid-file',str(pid_file),*native_mode],stdout=subprocess.DEVNULL,stderr=sys.stderr)
stopping=threading.Event()
def forward_output():
    with output.open() as stream:
        while not stopping.is_set():
            line=stream.readline()
            if line:
                sys.stdout.write(line);sys.stdout.flush()
            elif launcher.poll() is not None:
                stopping.set();return
            else:time.sleep(.05)
def forward_input():
    try:
        for line in sys.stdin:
            input_stream.write(line);input_stream.flush()
    finally:stopping.set()
def stop(signum,frame):stopping.set()
signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
threading.Thread(target=forward_output,daemon=True).start()
threading.Thread(target=forward_input,daemon=True).start()
print(f'Private HomeKit agent session: {session}',file=sys.stderr,flush=True)
try:
    while not stopping.wait(.2):pass
finally:
    cleanup={'nativePid':None,'identityVerified':False,'nativeExited':False}
    if pid_file.exists():
        native_pid=int(pid_file.read_text());cleanup['nativePid']=native_pid
        def identity():
            process=subprocess.run(['ps','-p',str(native_pid),'-o','command='],capture_output=True,text=True)
            text=process.stdout.strip()
            owned=process.returncode==0 and owned_native_command(text,executable,pid_file,session/'events.jsonl')
            return process.returncode==0,owned
        alive,owned=identity();cleanup['identityVerified']=owned
        if owned:
            try:os.kill(native_pid,signal.SIGTERM)
            except ProcessLookupError:pass
            deadline=time.monotonic()+5
            while time.monotonic()<deadline:
                alive,owned=identity()
                if not alive or not owned:break
                time.sleep(.05)
            if alive and owned:
                try:os.kill(native_pid,signal.SIGKILL)
                except ProcessLookupError:pass
                deadline=time.monotonic()+2
                while time.monotonic()<deadline:
                    alive,owned=identity()
                    if not alive or not owned:break
                    time.sleep(.05)
        cleanup['nativeExited']=not alive
    else:
        cleanup['nativeExited']=launcher.poll() is not None
    launcher.terminate()
    try:launcher.wait(timeout=5)
    except subprocess.TimeoutExpired:launcher.kill();launcher.wait()
    # A terminated app can briefly remain a zombie until LaunchServices reaps it.
    # Verify disappearance after joining the launcher; never signal a changed identity.
    if cleanup['nativePid'] is not None:
        deadline=time.monotonic()+2
        while time.monotonic()<deadline:
            alive,_=identity()
            if not alive:break
            time.sleep(.05)
        cleanup['nativeExited']=not alive
    (session/'cleanup.json').write_text(json.dumps(cleanup,indent=2)+'\n')
    input_stream.close();fifo.unlink(missing_ok=True)
    # Retain private event evidence; do not delete another agent's state or journal.

if not cleanup['nativeExited']:raise SystemExit('Owned native cleanup could not be verified; evidence retained')
