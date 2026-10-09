import{test,expect}from'bun:test';
import{mkdtemp,mkdir,writeFile,readFile,rm}from'node:fs/promises';
import{tmpdir}from'node:os';import{join}from'node:path';
import{backgroundService,servicePlist}from'./background-service.js';
test('LaunchAgent has stable current release entry and independent opt-in restart/login settings',async()=>{
 const text=servicePlist('/tmp/owner & service','/opt/bun',{startAtLogin:true,restartOnFailure:true});
 const p=Bun.spawn(['/usr/bin/plutil','-convert','json','-o','-','-'],{stdin:Buffer.from(text),stdout:'pipe',stderr:'pipe'});const value=JSON.parse(await new Response(p.stdout).text());expect(await p.exited).toBe(0);expect(value.ProgramArguments).toEqual(['/opt/bun','/tmp/owner & service/current/icloud-plugin.js','run','--prefix','/tmp/owner & service','--no-open']);expect(value.RunAtLoad).toBe(true);expect(value.KeepAlive).toBeUndefined();expect(servicePlist('/tmp/owner','/opt/bun',{startAtLogin:false,restartOnFailure:false})).not.toContain('KeepAlive');expect(()=>servicePlist('relative','/opt/bun',{startAtLogin:true,restartOnFailure:true})).toThrow();
});
test('configuration persists private settings and refuses foreign agent ownership',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-service-'));try{
  const prefix=join(root,'install');await mkdir(join(prefix,'runtime/logs'),{recursive:true});await writeFile(join(prefix,'.icloud-install'),JSON.stringify({format:1,owner:'icloud-plugin-install'}));
  let queued=0;const deps={home:root,execute:async()=>({code:1,out:''}),enqueue:()=>queued++};
  const result=await backgroundService(prefix,'configure',{startAtLogin:true,restartOnFailure:false},deps);expect(result.startAtLogin).toBe(true);expect(queued).toBe(1);expect(JSON.parse(await readFile(join(prefix,'runtime/service.json'),'utf8'))).toEqual({startAtLogin:true,restartOnFailure:false});
  await mkdir(join(root,'Library/LaunchAgents'),{recursive:true});const plist=join(root,'Library/LaunchAgents/com.decompozr.icloud-plugin.plist');await writeFile(plist,servicePlist('/tmp/another-owner',process.execPath,{startAtLogin:true,restartOnFailure:true}));
  await expect(backgroundService(prefix,'configure',{startAtLogin:false,restartOnFailure:false},deps)).rejects.toThrow('OWNERSHIP');expect(queued).toBe(1);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('restart drains the verified process before unloading; no force termination or provider retry',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-service-drain-'));try{
  const prefix=join(root,'install');await mkdir(join(prefix,'runtime/logs'),{recursive:true});await writeFile(join(prefix,'.icloud-install'),JSON.stringify({format:1,owner:'icloud-plugin-install'}));await writeFile(join(prefix,'runtime/service-process.json'),JSON.stringify({pid:123456}));const events:string[]=[];let alive=true;await mkdir(join(root,'Library/LaunchAgents'),{recursive:true});await writeFile(join(root,'Library/LaunchAgents/com.decompozr.icloud-plugin.plist'),servicePlist(prefix,process.execPath,{startAtLogin:false,restartOnFailure:false}));
  const deps={home:root,sleep:async()=>{},kill:((pid:number,signal?:string|number)=>{expect(pid).toBe(123456);if(signal==='SIGTERM'){events.push('graceful');alive=false;}else if(!alive)throw Object.assign(Error(),{code:'ESRCH'});return true}) as typeof process.kill,execute:async(args:string[])=>{events.push(args.slice(1).join(' '));if(args[0]==='/usr/bin/plutil')return{code:0,out:JSON.stringify([process.execPath,join(prefix,'current/icloud-plugin.js'),'run','--prefix',prefix,'--no-open'])};return args[0]==='/bin/ps'?{code:0,out:process.execPath+' '+join(prefix,'current/icloud-plugin.js')+' run --prefix '+prefix}:{code:0,out:'arguments = {\n'+[process.execPath,join(prefix,'current/icloud-plugin.js'),'run','--prefix',prefix,'--no-open'].join('\n')+'\n}\n'+(alive?'pid = 123456':'')}}};
  await backgroundService(prefix,'apply',undefined,deps);expect(events.some(x=>x.startsWith('disable '))).toBe(false);expect(events.findIndex(x=>x.startsWith('bootout '))).toBeGreaterThan(events.findIndex(x=>x==='graceful'));expect(events.some(x=>x.includes('SIGKILL')||x.includes('kickstart -k'))).toBe(false);expect(events.at(-2)?.startsWith('kickstart ')).toBe(true);expect(JSON.parse(await readFile(join(prefix,'runtime/service-operation.json'),'utf8')).state).toBe('completed');
 }finally{await rm(root,{recursive:true,force:true})}
});
test('server failure recovery is independent of login preference and intentional stop',async()=>{
 const{superviseRuntime}=await import('./background-service.js');let runs=0,delays=0;
 expect(await superviseRuntime(async()=>++runs===1?1:0,async()=>true,()=>false,async()=>{delays++})).toBe(0);expect(runs).toBe(2);expect(delays).toBe(1);
 runs=0;expect(await superviseRuntime(async()=>{runs++;return 1},async()=>false,()=>false,async()=>{})).toBe(1);expect(runs).toBe(1);
 expect(await superviseRuntime(async()=>1,async()=>true,()=>true,async()=>{throw Error('must not retry')})).toBe(0);
});
test('queued settings changes coalesce with per-request superseded receipts',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-service-coalesce-'));try{const prefix=join(root,'install');await mkdir(join(prefix,'runtime/logs'),{recursive:true});await writeFile(join(prefix,'.icloud-install'),JSON.stringify({format:1,owner:'icloud-plugin-install'}));const queued:string[]=[];const deps={home:root,sleep:async()=>{},execute:async()=>({code:1,out:''}),enqueue:(id:string)=>queued.push(id)};
 const a=await backgroundService(prefix,'configure',{startAtLogin:true,restartOnFailure:true},deps),b=await backgroundService(prefix,'configure',{startAtLogin:false,restartOnFailure:true},deps);expect(queued).toHaveLength(2);await backgroundService(prefix,'apply',undefined,deps,a.operation!.id);const old=await backgroundService(prefix,'status',undefined,deps,a.operation!.id);expect(old.operation?.state).toBe('superseded');expect(old.operation?.supersededBy).toBe(b.operation!.id);expect(old.startAtLogin).toBe(false);expect(await readFile(join(prefix,'runtime/service-operation.json'),'utf8')).toContain(b.operation!.id);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('an exited zombie cannot hold graceful drain open while its parent waits for service control',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-service-zombie-'));try{const prefix=join(root,'install');await mkdir(join(prefix,'runtime/logs'),{recursive:true});await writeFile(join(prefix,'.icloud-install'),JSON.stringify({format:1,owner:'icloud-plugin-install'}));await writeFile(join(prefix,'runtime/service-process.json'),JSON.stringify({pid:123456}));let signals=0;
 const deps={home:root,sleep:async()=>{},kill:((pid:number,signal?:string|number)=>{expect(pid).toBe(123456);if(signal==='SIGTERM')signals++;return true}) as typeof process.kill,execute:async(args:string[])=>{if(args[0]==='/bin/ps')return{code:0,out:args.at(-1)==='stat='?'Z':process.execPath+' '+join(prefix,'current/icloud-plugin.js')+' run --prefix '+prefix};return{code:args[1]==='print'?1:0,out:''}}};const result=await backgroundService(prefix,'apply',undefined,deps);expect(result.operation?.state).toBe('completed');expect(signals).toBe(1);
 }finally{await rm(root,{recursive:true,force:true})}
});
test('failed process inspection cannot classify a live process as drained',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-service-ps-failure-'));try{const prefix=join(root,'install');await mkdir(join(prefix,'runtime/logs'),{recursive:true});await writeFile(join(prefix,'.icloud-install'),JSON.stringify({format:1,owner:'icloud-plugin-install'}));await writeFile(join(prefix,'runtime/service-process.json'),JSON.stringify({pid:123456}));let bootstraps=0;const deps={home:root,sleep:async()=>{},kill:((pid:number)=>true) as typeof process.kill,execute:async(args:string[])=>{if(args[0]==='/bin/ps')return args.at(-1)==='stat='?{code:143,out:''}:{code:0,out:process.execPath+' '+join(prefix,'current/icloud-plugin.js')+' run --prefix '+prefix};if(args[1]==='bootstrap')bootstraps++;return{code:args[1]==='print'?1:0,out:''}}};await expect(backgroundService(prefix,'apply',undefined,deps)).rejects.toThrow('DRAIN_TIMEOUT');expect(bootstraps).toBe(0)}finally{await rm(root,{recursive:true,force:true})}
});
