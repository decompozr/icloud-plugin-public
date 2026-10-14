import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,symlink,readlink,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {restorePreviousRelease} from './service-update.js';
import {acquireRuntimeLock} from './runtime-lock.js';
for(const failure of ['none','stop','start'] as const)test('replacement recovery: '+failure,async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-update-recovery-'));
 try{await mkdir(join(root,'runtime'));await symlink('releases/new',join(root,'current'));const events:string[]=[];
 const recover=restorePreviousRelease(root,'releases/old',true,async action=>{events.push(action);if(action===failure)throw Error('fixture failure')});
 if(failure==='none')await recover;else await expect(recover).rejects.toThrow('SERVICE_UPDATE_RECOVERY_REQUIRED');
 expect(await readlink(join(root,'current'))).toBe(failure==='stop'?'releases/new':'releases/old');expect(events).toEqual(failure==='stop'?['stop']:['stop','start']);expect((await readdir(root)).some(name=>name.startsWith('.rollback-'))).toBe(false);
 const release=acquireRuntimeLock(root,'service-update');try{expect(()=>acquireRuntimeLock(root,'service-update')).toThrow('SERVICE_UPDATE_BUSY')}finally{release()}
 const again=acquireRuntimeLock(root,'service-update');again();
 }finally{await rm(root,{recursive:true,force:true})}
});
