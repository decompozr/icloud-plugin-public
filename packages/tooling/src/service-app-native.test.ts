import {test,expect} from 'bun:test';
import {mkdtemp,mkdir,cp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
const native=process.platform==='darwin'?test:test.skip;
for(const mode of ['graceful','parent-crash','foreign-prefix'] as const)native('native App ownership and lifecycle: '+mode,async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-app-native-'));
 let child:Bun.Subprocess|undefined;
 try{
  const prefix=join(root,'install'),app=join(prefix,'releases/fixture/DecompozR Studio.app'),resources=join(app,'Contents/Resources'),payload=join(resources,'payload'),exe=join(app,'Contents/MacOS/studio-service');
  await mkdir(prefix,{mode:0o700});await mkdir(join(prefix,'runtime'),{mode:0o700});await writeFile(join(prefix,'.icloud-install'),JSON.stringify({format:1,owner:'icloud-plugin-install'}));
  await mkdir(join(app,'Contents/MacOS'),{recursive:true});await mkdir(join(payload,'apps/studio/dist/server'),{recursive:true});
  await cp(process.execPath,join(resources,'bun'));
  const cli=await Bun.build({entrypoints:[join(import.meta.dir,'release-cli.ts')],target:'bun',outdir:payload,naming:'icloud-plugin.js'});expect(cli.success).toBe(true);
  await writeFile(join(payload,'apps/studio/dist/server/index.js'),`let pending;const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch(){pending=(async()=>{await Bun.sleep(500);await Bun.write(process.env.ICLOUD_INSTALL_PREFIX+'/runtime/accepted.txt','completed');return new Response('completed')})();return pending}});console.log('READY:'+server.port);process.on('SIGTERM',async()=>{await pending;await server.stop(true);process.exit(0)});`);
  await writeFile(join(app,'Contents/Info.plist'),'<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.decompozr.fixture.studio</string><key>CFBundleExecutable</key><string>studio-service</string><key>CFBundlePackageType</key><string>APPL</string></dict></plist>');
  const compile=Bun.spawn(['swiftc','-D','SERVICE_APP_TESTING','-parse-as-library',join(import.meta.dir,'native/ServiceLauncher.swift'),'-o',exe,'-framework','Security'],{stdout:'ignore',stderr:'pipe'});const diagnostic=await new Response(compile.stderr).text();expect(await compile.exited,diagnostic).toBe(0);
  const runtimeSign=Bun.spawn(['/usr/bin/codesign','--force','--sign','-','--options','runtime','--entitlements',join(import.meta.dir,'native/Bun.entitlements'),join(resources,'bun')],{stdout:'ignore',stderr:'ignore'});expect(await runtimeSign.exited).toBe(0);
  const sign=Bun.spawn(['/usr/bin/codesign','--force','--sign','-','--options','runtime',app],{stdout:'ignore',stderr:'ignore'});expect(await sign.exited).toBe(0);
  if(mode==='foreign-prefix'){const other=join(root,'other');await mkdir(other,{mode:0o700});await writeFile(join(other,'.icloud-install'),JSON.stringify({format:1,owner:'icloud-plugin-install'}));const rejected=Bun.spawn([exe,'run','--prefix',other,'--no-open'],{stdout:'ignore',stderr:'ignore'});expect(await rejected.exited).toBe(66);expect(await Bun.file(join(other,'runtime/service-process.json')).exists()).toBe(false);return;}
  child=Bun.spawn([exe,'run','--prefix',prefix,'--no-open'],{stdout:'pipe',stderr:'pipe'});
  const errors=new Response(child.stderr as ReadableStream<Uint8Array>).text();let output='';const pump=(async()=>{for await(const bytes of child!.stdout as ReadableStream<Uint8Array>)output+=new TextDecoder().decode(bytes)})();
  for(let i=0;i<100&&!output.includes('READY:');i++)await Bun.sleep(50);
  const port=Number(output.match(/READY:(\d+)/)?.[1]);if(!port){child.kill('SIGTERM');await child.exited;throw Error('Native startup failed: '+child.exitCode+' '+await errors+' '+output);}expect(port).toBeGreaterThan(0);
  const request=fetch('http://127.0.0.1:'+port);await Bun.sleep(100);const at=Date.now();child.kill(mode==='parent-crash'?'SIGKILL':'SIGTERM');
  expect(await (await request).text()).toBe('completed');expect(await child.exited).toBe(mode==='parent-crash'?137:0);await pump;
  expect(Date.now()-at).toBeGreaterThanOrEqual(350);expect(await Bun.file(join(prefix,'runtime/accepted.txt')).text()).toBe('completed');for(let i=0;i<60&&await Bun.file(join(prefix,'runtime/service-process.json')).exists();i++)await Bun.sleep(50);expect(await Bun.file(join(prefix,'runtime/service-process.json')).exists()).toBe(false);
 }finally{if(child&&child.exitCode===null){child.kill();await child.exited;}await rm(root,{recursive:true,force:true});}
},15000);
