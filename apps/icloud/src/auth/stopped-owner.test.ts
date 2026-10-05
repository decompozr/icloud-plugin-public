import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {makeSignature} from 'better-auth/crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {InstallationAccess} from '../server/installation-access.js';
import {createStoppedOwnerAuthorization} from './stopped-owner.js';

async function fixture(purpose:'runtime'|'maintenance'='maintenance'){
 const directory=mkdtempSync(join(tmpdir(),'icloud-stopped-owner-')),access=InstallationAccess.acquire(directory,purpose),db=new Database(':memory:');
 const secret='synthetic-existing-auth-secret-at-least-32',origin='https://private.invalid',token='synthetic-session',cookieName='__Secure-icloud.session_token',cookie=cookieName+'='+encodeURIComponent(token+'.'+await makeSignature(token,secret));
 let time=1000,owner='owner';db.exec('CREATE TABLE "user"(id TEXT PRIMARY KEY); CREATE TABLE session(id TEXT,userId TEXT,token TEXT,expiresAt INTEGER);');
 db.query('INSERT INTO "user" VALUES (?)').run(owner);db.query('INSERT INTO session VALUES (?,?,?,?)').run('session',owner,token,2000);
 const options={database:db,access,custodyDirectory:directory,origin,cookieName,secret,ownerId:()=>owner,now:()=>time,request:new Request(origin+'/icloud/maintenance',{headers:{origin,cookie}})};
 return{db,directory,access,options,cookie,setOwner(value:string){owner=value;},setTime(value:number){time=value;},close(){db.close();access.release();rmSync(directory,{recursive:true});}};
}
test('stopped owner authorization accepts exact signed persisted session and rechecks revocation/expiry/owner',async()=>{
 for(const mutation of ['owner','expiry','revocation','replacement']){
  const f=await fixture();try{
   const before=f.db.query('SELECT * FROM session').all(),auth=createStoppedOwnerAuthorization(f.options);expect(auth.ownerId).toBe('owner');auth.assertAuthorized();expect(f.db.query('SELECT * FROM session').all()).toEqual(before);
   if(mutation==='owner')f.setOwner('other');if(mutation==='expiry')f.setTime(2000);if(mutation==='revocation')f.db.exec('DELETE FROM session');if(mutation==='replacement')f.db.exec("UPDATE session SET id='replacement'");
   expect(()=>auth.assertAuthorized()).toThrow('denied');
  }finally{f.close();}
 }
});
test('stopped owner authorization denies wrong signatures, duplicate cookies, contexts and missing schema without repair',async()=>{
 const f=await fixture();try{
  const requests:Record<string,string>[]=[{origin:f.options.origin,cookie:f.cookie+'; '+f.cookie},{origin:f.options.origin,cookie:f.cookie.replace('synthetic-session','spoofed-session')},{origin:'https://other.invalid',cookie:f.cookie},{origin:f.options.origin,cookie:'icloud.session_token='+f.cookie.split('=')[1]},{origin:f.options.origin}];
  for(const headers of requests){
   expect(()=>createStoppedOwnerAuthorization({...f.options,request:new Request(f.options.origin+'/icloud/maintenance',{headers})})).toThrow('denied');
  }
  expect(()=>createStoppedOwnerAuthorization({...f.options,secret:'other-existing-auth-secret-at-least-32'})).toThrow('denied');
  expect(()=>createStoppedOwnerAuthorization({...f.options,custodyDirectory:join(f.directory,'other')})).toThrow('conflict');
  f.db.exec('DROP TABLE session');expect(()=>createStoppedOwnerAuthorization(f.options)).toThrow('denied');expect(f.db.query("SELECT name FROM sqlite_master WHERE name='session'").all()).toEqual([]);
 }finally{f.close();}
});
test('runtime access cannot authorize stopped maintenance',async()=>{
 const f=await fixture('runtime');try{expect(()=>createStoppedOwnerAuthorization(f.options)).toThrow('conflict');}finally{f.close();}
});
