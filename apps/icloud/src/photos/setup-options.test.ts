import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseSetupOptions,reserveSetupDirectory} from './setup-options.js';

test('setup requires explicit absolute destinations and unambiguous options',()=>{
 expect(()=>parseSetupOptions(['relative'])).toThrow();
 expect(()=>parseSetupOptions(['/tmp/runtime','--python','relative'])).toThrow();
 expect(()=>parseSetupOptions(['/tmp/runtime','--sign','one','--sign','two'])).toThrow();
 expect(parseSetupOptions(['/tmp/runtime','--python','/private/python','--sign','Developer Identity'])).toEqual({directory:'/tmp/runtime',python:'/private/python',sign:'Developer Identity'});
});
test('setup preserves existing helper even without a venv and rejects simultaneous reservations',async()=>{
 const root=await mkdtemp(join(tmpdir(),'photos-setup-test-'));
 try{
  const existing=join(root,'existing');await mkdir(existing,{mode:0o700});
  const helper=join(existing,'helper');await writeFile(helper,'authorized existing binary');
  await expect(reserveSetupDirectory(existing)).rejects.toThrow('Existing runtime retained');
  expect(await readFile(helper,'utf8')).toBe('authorized existing binary');
  const fresh=join(root,'fresh');
  const attempts=await Promise.allSettled([reserveSetupDirectory(fresh),reserveSetupDirectory(fresh)]);
  expect(attempts.filter(a=>a.status==='fulfilled')).toHaveLength(1);
  await expect(reserveSetupDirectory(fresh)).rejects.toThrow();
 }finally{await rm(root,{recursive:true,force:true});}
});
