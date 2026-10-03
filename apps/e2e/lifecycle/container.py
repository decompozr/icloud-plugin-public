"""Actual app image fixture: bootstrap-only, no owner/Apple credentials/network mail."""
import hashlib,json,os,pathlib,shutil,subprocess,sys,tempfile,time,urllib.request,uuid
image=sys.argv[1] if len(sys.argv)>1 else 'icloud-plugin-cp5:0.1.0'
root=pathlib.Path(tempfile.mkdtemp(prefix='icloud-cp5-container-'))
name='icloud-cp5-'+uuid.uuid4().hex[:12]
def command(*args,check=True):
 r=subprocess.run(['container',*args],capture_output=True,text=True,timeout=30)
 if check and r.returncode: raise RuntimeError(r.stderr or r.stdout)
 return r
try:
 for part in ['config','state','custody']:
  (root/part).mkdir();(root/part).chmod(0o777 if part!='config' else 0o755)
 config=root/'config'/'config.toml'
 config.write_text('''public_origin="https://icloud.invalid"
private_origin="https://icloud.invalid:8443"
public_port=4100
private_port=4101
host="0.0.0.0"
runtime_mode="container"
state_directory="/state"
master_key_file="/custody/master.key"
installation_marker="/custody/installation.marker"
tailscale_binary="/nonexistent-fixture-tailscale"
''')
 config.chmod(0o644)
 mounts=['--mount',f'type=bind,source={root}/config,target=/config,readonly','--volume',f'{root}/state:/state','--volume',f'{root}/custody:/custody']
 initialize=command('run','--rm','--name',name+'-init','--cpus','1','--memory','512M',*mounts,image,'--initialize')
 assert 'initialized' in initialize.stderr
 before=hashlib.sha256((root/'custody'/'master.key').read_bytes()).hexdigest()
 command('run','--detach','--name',name,'--cpus','1','--memory','512M',*mounts,image)
 for iteration in range(2):
  inspection=json.loads(command('inspect',name).stdout)[0]
  ip=inspection['status']['networks'][0]['ipv4Address'].split('/')[0]
  def get(port,path,method='GET',data=None):
   request=urllib.request.Request(f'http://{ip}:{port}{path}',method=method,data=data,headers={'Host':f'127.0.0.1:{port}','Content-Type':'application/json'})
   return urllib.request.urlopen(request,timeout=5)
  for attempt in range(40):
   try:
    probe=command('exec',name,'bun','--eval',"const r=await fetch('http://127.0.0.1:4101/icloud/setup/health');if(!r.ok||await r.text()!=='icloud-private')process.exit(1)",check=False)
    if probe.returncode:raise OSError('Private loopback health not ready')
    break
   except OSError:
    if attempt==39:raise RuntimeError(command('logs',name,check=False).stdout)
    time.sleep(.1)
  try:get(4101,'/icloud/setup/health')
  except urllib.error.HTTPError as error:assert error.code==403
  else:raise AssertionError('Untrusted direct private ingress accepted')
  try:get(4100,'/icloud/mcp',method='POST',data=b'{}')
  except urllib.error.HTTPError as error:assert error.code==401
  else:raise AssertionError('Anonymous MCP accepted')
  uid=command('exec',name,'id','-u').stdout.strip();assert uid=='10001'
  assert command('exec',name,'test','!','-d','/opt/icloud/apps/icloud/src').returncode==0
  command('stop','--time','5',name)
  assert json.loads(command('inspect',name).stdout)[0]['status']['state']=='stopped'
  assert hashlib.sha256((root/'custody'/'master.key').read_bytes()).hexdigest()==before
  try:get(4101,'/icloud/setup/health')
  except OSError:pass
  else:raise AssertionError('Stopped listener reachable')
  print(f'Actual app Linux runtime iteration {iteration+1}: private loopback health/direct-host403, MCP401, UID10001, persisted key, shutdown passed',flush=True)
  if iteration==0:command('start',name)
finally:
 for owned in [name,name+'-init']:
  if command('inspect',owned,check=False).returncode==0:
   command('stop','--time','2',owned,check=False);command('delete',owned)
 shutil.rmtree(root)
 print('Owned application containers and temporary state/custody removed',flush=True)
