import {test,expect} from 'bun:test';
import {randomBytes} from 'node:crypto';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

test('built private HTTP download authenticates owner and packages only installed public configuration',async()=>{
 const runtime=process.env.CP5_ARTIFACT_DIR?resolve(process.env.CP5_ARTIFACT_DIR,'apps/icloud/dist'):resolve(import.meta.dir,'../../icloud/dist');
 const {createPrivateAdmin}:typeof import('../../icloud/dist/admin/handler.js')=await import(pathToFileURL(join(runtime,'admin/handler.js')).href);
 const {SqliteOwnerStore}:typeof import('../../icloud/dist/storage/owner-store.js')=await import(pathToFileURL(join(runtime,'storage/owner-store.js')).href);
 const {configuredPluginArchive}:typeof import('../../icloud/dist/plugin/package.js')=await import(pathToFileURL(join(runtime,'plugin/package.js')).href);
 const dir=await mkdtemp(join(tmpdir(),'icloud-download-')),proof=randomBytes(32).toString('hex'),key=randomBytes(32);
 const store=SqliteOwnerStore.provision({databasePath:join(dir,'db'),markerPath:join(dir,'marker'),masterKey:key,bootstrapProof:proof});store.enroll({proof,ownerId:'owner',credential:Buffer.from('PRIVATE-CREDENTIAL-CANARY')});
 const template=process.env.CP5_ARTIFACT_DIR?resolve(process.env.CP5_ARTIFACT_DIR,'apps/icloud/dist/plugin-template'):resolve(import.meta.dir,'../../icloud/dist/plugin-template');
 const handler=createPrivateAdmin({privateOrigin:'https://private.example.invalid',publicMcpUrl:'https://public.example.invalid/icloud/mcp',pluginArchive:()=>configuredPluginArchive(template,'https://public.example.invalid'),store,ownerAuth:{ownerSession:async headers=>{if(headers.get('authorization')!=='Bearer fixture-owner')throw Error('Denied');return{user:{id:'owner'}};},enrollmentSession:async()=>{throw Error('Denied');}},diagnostics:async()=>({installed:true,authenticated:true,online:true,privateReachable:true}),validateCredential:async()=>{}});
 const server=Bun.serve({hostname:'127.0.0.1',port:0,fetch:handler});try{
 const url=`http://127.0.0.1:${server.port}/icloud/admin/plugin.zip?url=https://attacker.invalid`;
 expect((await fetch(url)).status).toBe(403);
 const response=await fetch(url,{headers:{authorization:'Bearer fixture-owner'}});expect(response.status).toBe(200);expect(response.headers.get('content-disposition')).toBe('attachment; filename="icloud-plugin.zip"');expect(response.headers.get('cache-control')).toBe('no-store');
 const bytes=Buffer.from(await response.arrayBuffer());expect(bytes.toString()).not.toContain('PRIVATE-CREDENTIAL-CANARY');expect(bytes.toString()).not.toContain('fixture-owner');
 const path=join(dir,'plugin.zip');await writeFile(path,bytes);const check=Bun.spawn(['unzip','-t',path],{stdout:'pipe'});expect(await check.exited).toBe(0);
 const read=Bun.spawn(['unzip','-p',path,'icloud-plugin/mcp.json'],{stdout:'pipe'});const config=await new Response(read.stdout).text();expect(config).toContain('https://public.example.invalid/icloud/mcp');expect(config).not.toContain('attacker.invalid');
 const manifest=Bun.spawn(['unzip','-p',path,'icloud-plugin/plugin.json'],{stdout:'pipe'});const manifestText=await new Response(manifest.stdout).text();expect(manifestText).toContain('\"version\": \"0.1.26\"');
 }finally{server.stop(true);store.close();key.fill(0);await rm(dir,{recursive:true,force:true});}
});
