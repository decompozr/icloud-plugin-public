#!/usr/bin/env python3
"""Read-only signed Catalyst presentation acceptance; private output only."""
from pathlib import Path
import subprocess,json,tempfile,threading,queue,time,os,sys
if len(sys.argv)!=3:raise SystemExit('Usage: background-check.py SIGNED_BUILD_RECEIPT PRIVATE_OUTPUT_ROOT')
base=Path(sys.argv[2]).resolve();root=Path(tempfile.mkdtemp(prefix='acceptance-',dir=base));root.chmod(0o700)
build=json.loads(Path(sys.argv[1]).read_text());assert build['state']=='succeeded' and build['signatureVerified']
p=subprocess.Popen(['/usr/bin/python3','apps/icloud/src/homekit/stdio-adapter.py','--app',build['app'],'--state-directory',str(root/'sessions'),'--read-only'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=(root/'adapter.log').open('w'),text=True)
q=queue.Queue();seq=0;status=None
threading.Thread(target=lambda:[q.put(json.loads(line)) for line in p.stdout],daemon=True).start()
def request(method,params):
 global seq
 seq+=1;p.stdin.write(json.dumps({'jsonrpc':'2.0','id':seq,'method':method,'params':params})+'\n');p.stdin.flush()
 while True:
  r=q.get(timeout=20)
  if r.get('id')==seq:
   assert 'error' not in r,r
   return r['result']
try:
 initial=request('initialize',{});assert initial['serverInfo']['version']=='0.15.0'
 for _ in range(50):
  r=request('tools/call',{'name':'homekit_status','arguments':{}});status=json.loads(r['content'][0]['text'])
  if status['ready'] and status['authorized']:break
  time.sleep(.1)
 (root/'status.json').write_text(json.dumps(status,indent=2)+'\n')
 assert status['ready'] and status['authorized'] and not status['physicalControlEnabled']
 assert status['presentationMode']=='background' and status['visibleWindowCount']==0
 time.sleep(1)
 r=request('tools/call',{'name':'homekit_status','arguments':{}});status=json.loads(r['content'][0]['text']);(root/'status.json').write_text(json.dumps(status,indent=2)+'\n')
 env=dict(os.environ,DEVELOPER_DIR='/Applications/Xcode.app/Contents/Developer')
 inspector=json.loads(subprocess.check_output(['xcrun','swift',str(Path(__file__).with_name('background-inspect.swift')),str(status['processId'])],env=env,text=True));(root/'presentation.json').write_text(json.dumps(inspector,indent=2)+'\n')
 assert inspector['runningApplicationFound'] and inspector['activationPolicy']==1 and inspector['ownedVisibleWindowCount']==0,inspector
except Exception as error:
 (root/'failure.json').write_text(json.dumps({'status':'failed','error':str(error)},indent=2)+'\n');raise
finally:
 p.stdin.close();p.wait(timeout=20);assert p.returncode==0,'Cleanup failed'
summary={'status':'passed','nativeHomeReadyAuthorized':True,'backgroundMode':True,'dockHidden':True,'visibleWindows':0,'physicalWrites':0,'ownedNativeProcessStopped':subprocess.run(['ps','-p',str(status['processId'])],stdout=subprocess.DEVNULL).returncode!=0}
assert summary['ownedNativeProcessStopped'];(root/'summary.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps({'root':str(root),**summary}))
