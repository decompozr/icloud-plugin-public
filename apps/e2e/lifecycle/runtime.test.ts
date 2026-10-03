import {test,expect} from 'bun:test';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {installArtifact} from '../../../packages/tooling/src/install.js';
const artifact=process.env.CP5_ARTIFACT_DIR;
const scenario=artifact?test:test.skip;
scenario('installed artifact initializes explicitly, restarts without resetting custody, and shuts down',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'icloud-artifact-runtime-'));
 const allocate=()=>{const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:()=>new Response()});const port=server.port;server.stop(true);return port;};
 const publicPort=allocate(),privatePort=allocate();
 const config=join(dir,'config.toml');
 const base=`http://127.0.0.1:${privatePort}`,publicBase=`http://127.0.0.1:${publicPort}`;
 const prefix=join(dir,'.installed');
 await installArtifact(resolve(artifact!),prefix);
 const entry=join(prefix,'current/runtime.sh');
 let child:ReturnType<typeof Bun.spawn>|undefined;
 const spawn=(initialize=false)=>Bun.spawn([entry,config,...(initialize?['--initialize']:[])],{cwd:dir,env:{PATH:`${dirname(process.execPath)}:/usr/bin:/bin`},stdout:'pipe',stderr:'pipe'});
 try{
  await Bun.write(config,`public_origin="https://icloud.invalid"\nprivate_origin="https://icloud.invalid:8443"\npublic_port=${publicPort}\nprivate_port=${privatePort}\nstate_directory="./state"\nmaster_key_file="./custody/master.key"\ninstallation_marker="./custody/installation.marker"\ntailscale_binary="/nonexistent-fixture-tailscale"\n`);
  expect(await spawn().exited).toBe(1);
  expect(await spawn(true).exited).toBe(0);
  const key=await readFile(join(dir,'custody/master.key')),marker=await readFile(join(dir,'custody/installation.marker'));
  expect(await spawn(true).exited).toBe(1);
  for(let iteration=0;iteration<2;iteration++){
   child=spawn();
   let ready=false;
   for(let attempt=0;attempt<100;attempt++){
    try{if((await fetch(base+'/icloud/setup/health')).ok){ready=true;break;}}catch{}
    if(child.exitCode!==null)throw Error('Artifact startup failed: '+await new Response(child.stderr as ReadableStream<Uint8Array>).text());
    await Bun.sleep(30);
   }
   expect(ready).toBe(true);
   expect((await fetch(publicBase+'/icloud/mcp',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).status).toBe(401);
   const setup=await fetch(base+'/icloud/setup');
   expect(await setup.text()).toContain('Tailscale');
   const script=await fetch(base+'/icloud/assets/admin-browser.js');expect(script.status).toBe(200);expect(script.headers.get('content-type')).toContain('javascript');expect((await script.text()).length).toBeGreaterThan(1000);
   expect((await fetch(publicBase+'/icloud/assets/auth-browser.js')).status).toBe(200);
   child.kill('SIGTERM');expect(await child.exited).toBe(0);child=undefined;
   await expect(fetch(base+'/icloud/setup/health')).rejects.toThrow();
   expect(await readFile(join(dir,'custody/master.key'))).toEqual(key);
   expect(await readFile(join(dir,'custody/installation.marker'))).toEqual(marker);
  }
 }finally{if(child){child.kill('SIGKILL');await child.exited;}await rm(dir,{recursive:true,force:true});}
},15000);
