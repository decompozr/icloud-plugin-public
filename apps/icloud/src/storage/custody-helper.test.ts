import {test,expect} from 'bun:test';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {CustodyHelper} from './custody-helper.js';
import {CustodyError} from './custody-contract.js';
function fixture(mode:string,timeoutMs=2000){
 const directory=mkdtempSync(join(tmpdir(),'icloud-helper-')),record=join(directory,'processes'),installationId=randomUUID(),identity={installationId,ownerId:'owner',accountId:randomUUID(),revision:1,generation:1};
 const helper=new CustodyHelper({installationId,command:[process.execPath,join(import.meta.dir,'custody-helper.worker.ts'),mode,record],timeoutMs});
 return{helper,installationId,identity,record,close(){rmSync(directory,{recursive:true});}};
}
test('helper reads return exact owned bytes and additions snapshot borrowed buffers',async()=>{
 const f=fixture('success');try{
  const master=await f.helper.master.read(f.installationId,{interaction:'prohibited'}),password=await f.helper.passwords.read(f.identity,{interaction:'prohibited'});
  expect(Buffer.from(master).equals(Buffer.alloc(32,7))).toBe(true);expect(Buffer.from(password).toString()).toBe('synthetic-password');master.fill(0);password.fill(0);
 }finally{f.close();}
 const add=fixture('validate-add');try{const bytes=Buffer.alloc(32,7),pending=add.helper.addMaster(add.installationId,bytes,{interaction:'setup'});bytes.fill(0);await pending;expect(bytes.every(value=>value===0)).toBe(true);}finally{add.close();}
});
test('helper rejects mismatched installation and interactive reads before spawning',async()=>{
 const f=fixture('success');try{
  await expect(f.helper.passwords.read({...f.identity,installationId:randomUUID()},{interaction:'prohibited'})).rejects.toThrow('conflict');
  await expect(f.helper.master.read(f.installationId,{interaction:'setup'} as never)).rejects.toThrow('invalid_input');
  await expect(f.helper.addMaster(f.installationId,Buffer.alloc(31),{interaction:'setup'})).rejects.toThrow('invalid_input');
  expect(()=>readFileSync(f.record)).toThrow();
 }finally{f.close();}
});
test('helper preserves bounded declared native failures without fallback',async()=>{
 for(const mode of ['missing','locked']){const f=fixture(mode);try{await expect(f.helper.master.read(f.installationId,{interaction:'prohibited'})).rejects.toThrow(mode);}finally{f.close();}}
});
test('read transport failures discard bytes and redact diagnostics',async()=>{
 for(const mode of ['overflow','stderr','malformed','wrong-id','wrong-size','extra','nonzero']){
  const f=fixture(mode);try{await expect(f.helper.master.read(f.installationId,{interaction:'prohibited'})).rejects.toEqual(new CustodyError('recovery_required'));}finally{f.close();}
 }
});
test('lost mutation reply returns unknown without automatic retry and child is terminal',async()=>{
 const f=fixture('lost');try{
  await expect(f.helper.addMaster(f.installationId,Buffer.alloc(32,7),{interaction:'prohibited'})).rejects.toThrow('outcome_unknown');
  const lines=readFileSync(f.record,'utf8').trim().split('\n');expect(lines).toHaveLength(2);expect(lines[1]).toBe('applied');
  expect(()=>process.kill(JSON.parse(lines[0]!).pid,0)).toThrow();
 }finally{f.close();}
});
test('deadline terminates stalled helper for reads and mutations',async()=>{
 for(const action of ['read','delete']){const f=fixture('hang',200);try{
  const started=performance.now(),pending=action==='read'?f.helper.master.read(f.installationId,{interaction:'prohibited'}):f.helper.deleteMaster(f.installationId,{interaction:'prohibited'});
  await expect(pending).rejects.toThrow(action==='read'?'recovery_required':'outcome_unknown');expect(performance.now()-started).toBeLessThan(1500);
  const pid=JSON.parse(readFileSync(f.record,'utf8').trim()).pid;expect(()=>process.kill(pid,0)).toThrow();
 }finally{f.close();}}
});
