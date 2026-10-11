import {test,expect} from 'bun:test';
import {fileURLToPath} from 'node:url';
test('metadata writes require fresh broker snapshot and matching open library before any Photos scripting',async()=>{
 const script=fileURLToPath(new URL('./metadata-write.py',import.meta.url));
 const python=process.env.PHOTOS_TEST_PYTHON??'/usr/bin/python3';
 const code=`import sys,types,importlib.util,json
sys.path.insert(0,sys.argv[1].rsplit('/',1)[0])
sys.modules['photoscript']=types.SimpleNamespace(Photo=lambda _: (_ for _ in ()).throw(Exception('unexpected mutation')))
spec=importlib.util.spec_from_file_location('metadata',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
expected={'assets':[],'openLibraryMatches':True}
request={'expected':expected,'mutation':{'values':{}},'library':'/unused','readerHelper':'/unused'}
module.snapshot=lambda _: {'assets':[],'openLibraryMatches':False}
assert module.run(request)['status']=='stale_plan'
request['expected']={'assets':[],'openLibraryMatches':False}
assert module.run(request)['status']=='wrong_open_library'
print(json.dumps({'preflightBeforeMutation':True}))`;
 const child=Bun.spawn([python,'-I','-B','-c',code,script],{stdout:'pipe',stderr:'pipe'});
 const [out,err,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
 expect(err).toBe('');expect(exit).toBe(0);expect(JSON.parse(out)).toEqual({preflightBeforeMutation:true});
});
