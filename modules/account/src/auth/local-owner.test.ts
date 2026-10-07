import {test,expect} from 'bun:test';
import {mkdtempSync,mkdirSync,rmSync,chmodSync,readFileSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalOwnerAccess,prepareLocalOwner,createRemoteOwnerPairing} from './local-owner.js';
import type {OwnerAccessSettings} from './local-owner.js';
test('local enrollment requires explicit one-use OS custody, exact origin and session owner binding',()=>{
 const dir=mkdtempSync(join(tmpdir(),'local-owner-'));mkdirSync(join(dir,'custody'),{mode:0o700});
 const settings={local_origin:'http://localhost:49100',master_key_file:join(dir,'custody/key')} as OwnerAccessSettings;
 let owner:string|null='established-owner',time=1000;
 const access=createLocalOwnerAccess(settings,()=>owner,()=>time);
 const request=(proof?:string,cookie='',origin=settings.local_origin!,host='localhost:49100')=>new Request(settings.local_origin+'/icloud/setup/begin',{method:'POST',headers:{origin,host,cookie},body:JSON.stringify({proof})});
 try{
  const first=prepareLocalOwner(settings,owner,time),proof=new URLSearchParams(new URL(first).hash.slice(1)).get('owner-proof')!;
  expect(()=>access.begin(request(),proof)).not.toThrow();
  expect(()=>access.begin(request(),proof)).toThrow(); // proof file consumed atomically
  const second=prepareLocalOwner(settings,owner,time),nextProof=new URLSearchParams(new URL(second).hash.slice(1)).get('owner-proof')!;
  expect(()=>access.begin(request(undefined,'','http://evil.invalid'),nextProof)).toThrow();
  expect(()=>access.begin(request(undefined,'',undefined,'127.0.0.1:49100'),nextProof)).toThrow();
  chmodSync(join(dir,'custody/local-owner-proof'),0o640);expect(()=>access.begin(request(),nextProof)).toThrow();chmodSync(join(dir,'custody/local-owner-proof'),0o600);
  const cookie=access.begin(request(),nextProof).split(';')[0]!;
  expect(()=>access.authorize(request())).toThrow();access.authorize(request(undefined,cookie));
  expect(()=>access.bind(request(undefined,cookie),'wrong-owner')).toThrow();access.bind(request(undefined,cookie),'established-owner');
  expect(access.authorize(request(undefined,cookie)).user).toBe('established-owner');
  owner='different-owner';expect(()=>access.authorize(request(undefined,cookie))).toThrow();owner='established-owner';time+=600001;expect(()=>access.authorize(request(undefined,cookie))).toThrow();
  access.close();expect(()=>access.authorize(request(undefined,cookie))).toThrow();
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('remote owner pairing is explicit, owner-bound, single-use and expires without changing custody',()=>{
 let owner:string|null='owner',time=1000;const origin='https://remote.invalid:8443';
 const access=createRemoteOwnerPairing(origin,()=>owner,()=>time);
 const request=(cookie='',requestOrigin=origin)=>new Request(origin+'/icloud/setup/begin',{method:'POST',headers:{origin:requestOrigin,cookie}});
 expect(()=>access.issue('other')).toThrow();
 const url=access.issue('owner'),token=new URLSearchParams(new URL(url).hash.slice(1)).get('owner-proof')!;
 expect(()=>access.begin(request('','https://evil.invalid'),token)).toThrow();
 const cookie=access.begin(request(),token).split(';')[0]!;
 expect(()=>access.begin(request(),token)).toThrow();expect(()=>access.authorize(request())).toThrow();
 expect(()=>access.bind(request(cookie),'other')).toThrow();access.bind(request(cookie),'owner');
 access.complete(request(cookie),'owner');expect(()=>access.authorize(request(cookie))).toThrow();
 const expired=new URLSearchParams(new URL(access.issue('owner')).hash.slice(1)).get('owner-proof')!;time+=300001;expect(()=>access.begin(request(),expired)).toThrow();
 const changed=new URLSearchParams(new URL(access.issue('owner')).hash.slice(1)).get('owner-proof')!;owner='other';expect(()=>access.begin(request(),changed)).toThrow();
});


test('OS custody authorization regenerates only expired same-owner private regular files',()=>{
 const dir=mkdtempSync(join(tmpdir(),'local-owner-expiry-'));mkdirSync(join(dir,'custody'),{mode:0o700});
 const settings={local_origin:'http://localhost:49100',master_key_file:join(dir,'custody/key')} as OwnerAccessSettings,path=join(dir,'custody/local-owner-proof');
 try{
  const first=prepareLocalOwner(settings,'owner',1000),bytes=readFileSync(path,'utf8');
  expect(()=>prepareLocalOwner(settings,'owner',2000)).toThrow('already pending');expect(readFileSync(path,'utf8')).toBe(bytes);
  expect(()=>prepareLocalOwner(settings,'other',700000)).toThrow('owner mismatch');expect(readFileSync(path,'utf8')).toBe(bytes);
  chmodSync(path,0o640);expect(()=>prepareLocalOwner(settings,'owner',700000)).toThrow('Private OS-owner');expect(readFileSync(path,'utf8')).toBe(bytes);chmodSync(path,0o600);
  const second=prepareLocalOwner(settings,'owner',700000);expect(second).not.toBe(first);
  const replacement=readFileSync(path,'utf8');rmSync(path);symlinkSync(join(dir,'custody/key'),path);expect(()=>prepareLocalOwner(settings,'owner',1400000)).toThrow();rmSync(path);
  expect(JSON.parse(replacement).owner).toBe('owner');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
