"""Run built application E2E graph in production Linux image, test-only RO mount."""
import pathlib,shutil,subprocess,sys,tempfile,uuid,os,json
root=pathlib.Path(__file__).resolve().parents[3]
image=sys.argv[1] if len(sys.argv)>1 else 'icloud-plugin-cp5:0.1.0'
selected=sys.argv[2] if len(sys.argv)>2 else ''
if selected and (pathlib.Path(selected).name!=selected or not selected.endswith('.test.js')):raise SystemExit('Expected a built test basename')
stage=pathlib.Path(tempfile.mkdtemp(prefix='icloud-linux-e2e-'))
name='icloud-e2e-'+uuid.uuid4().hex[:12]
test_image=name+':test'
try:
 # ZIP integrity checks need unzip; keep this test dependency out of production.
 context=stage/'image';context.mkdir()
 if any(c.isspace() for c in image) or not image or image.startswith('-'):raise ValueError('Invalid image reference')
 (context/'Dockerfile').write_text(f'FROM {image}\nUSER root\nRUN apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/*\nUSER 10001:10001\n')
 subprocess.run(['container','build','--progress','plain','-t',test_image,str(context)],check=True,timeout=180)
 shutil.rmtree(context)
 shutil.copytree(root/'apps/e2e/dist',stage/'dist')
 package=(root/'apps/e2e/node_modules/cbor-x').resolve()
 fixture=stage/'node_modules/cbor-x';fixture.mkdir(parents=True)
 # cbor-x fixture encoder: copy JavaScript and metadata only, no native addons.
 for source in package.iterdir():
  if source.is_file() and (source.suffix in ['.js','.json','.md'] or source.name=='LICENSE'):
   shutil.copy2(source,fixture/source.name)
 # Resolve test imports against Linux image dependencies, never host node_modules.
 dependencies=json.loads((root/'apps/e2e/package.json').read_text())['dependencies']
 for dependency in [*dependencies,'imapflow','zod-to-json-schema','better-auth','@better-auth/passkey','@better-auth/oauth-provider']:
  if dependency == 'cbor-x':continue
  link=stage/'node_modules'/dependency;link.parent.mkdir(parents=True,exist_ok=True)
  link.symlink_to('/opt/icloud/apps/icloud/node_modules/'+dependency)
 for directory,_,files in os.walk(stage):
  os.chmod(directory,0o755)
  for file in files:
   entry=pathlib.Path(directory)/file
   if not entry.is_symlink():os.chmod(entry,0o644)
 result=subprocess.run(['container','run','--name',name,'--cpus','2','--memory','1G',
  '--mount',f'type=bind,source={stage},target=/opt/icloud/apps/e2e,readonly',
  '--env','CP5_ARTIFACT_DIR=/opt/icloud','--env','CBOR_NATIVE_ACCELERATION_DISABLED=true','--entrypoint','bun',test_image,
  'test','/opt/icloud/apps/e2e/dist'+('/'+selected if selected else '')],timeout=90)
 if result.returncode:raise SystemExit(result.returncode)
finally:
 found=subprocess.run(['container','inspect',name],capture_output=True)
 if found.returncode==0:
  subprocess.run(['container','stop','--time','2',name],capture_output=True)
  removed=subprocess.run(['container','delete',name],capture_output=True)
  if removed.returncode and subprocess.run(['container','inspect',name],capture_output=True).returncode==0: raise RuntimeError('Owned container cleanup failed')
 subprocess.run(['container','image','delete',test_image],capture_output=True)
 shutil.rmtree(stage)
