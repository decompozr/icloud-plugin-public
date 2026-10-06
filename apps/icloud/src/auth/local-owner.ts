import {randomBytes,timingSafeEqual} from 'node:crypto';
import {lstatSync,readFileSync,writeFileSync,unlinkSync,existsSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {z} from 'zod';
import type {AppSettings} from '../server/settings.js';
const schema=z.object({proof:z.string().min(32).max(128),expires:z.number(),owner:z.string().nullable()}).strict();
const pathFor=(settings:AppSettings)=>join(dirname(settings.master_key_file),'local-owner-proof');
/** Explicit OS-owner custody, never inferred from localhost or proxy headers. */
export function prepareLocalOwner(settings:AppSettings,owner:string|null,now=Date.now()){
 if(!settings.local_origin)throw Error('Configure an explicit local_origin before preparing local enrollment');
 const path=pathFor(settings),proof=randomBytes(32).toString('base64url');
 if(existsSync(path)){const info=lstatSync(path);if(!info.isFile()||info.uid!==process.getuid?.()||(info.mode&0o077)!==0)throw Error('Private OS-owner proof required');const old=schema.parse(JSON.parse(readFileSync(path,'utf8')));if(old.owner!==owner)throw Error('Local enrollment authorization owner mismatch');if(old.expires>now)throw Error('A local enrollment authorization is already pending');unlinkSync(path);}
 writeFileSync(path,JSON.stringify({proof,expires:now+600000,owner}),{flag:'wx',mode:0o600});
 return settings.local_origin+'/icloud/setup?mode=local-owner#owner-proof='+proof;
}
export function createLocalOwnerAccess(settings:AppSettings,owner:()=>string|null,now=Date.now){
 if(!settings.local_origin)throw Error('Local owner origin required');
 const origin=settings.local_origin,grants=new Map<string,{expires:number;owner:string|null;user?:string}>();
 const nonce=randomBytes(32).toString('base64url'),cookieName='icloud_local_setup';
 const exact=(request:Request)=>{const u=new URL(request.url);if(u.origin!==origin||request.headers.has('host')&&request.headers.get('host')!==u.host||(request.headers.get('origin')!==origin&&!(request.method==='GET'&&!request.headers.has('origin')&&request.headers.get('sec-fetch-site')==='same-origin')))throw Error('Local origin required');};
 const grant=(request:Request)=>{exact(request);const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1);const item=token?grants.get(token):undefined;if(!item||item.expires<=now()||item.owner!==owner())throw Error('Local enrollment authorization required');return item;};
 return {
  proof:nonce,
  checkProof(value:string){if(value!==nonce)throw Error('Local enrollment denied');},
  begin(request:Request,proof:string){
   exact(request);const path=pathFor(settings),info=lstatSync(path);if(!info.isFile()||info.uid!==process.getuid?.()||(info.mode&0o077)!==0)throw Error('Private OS-owner proof required');
   const item=schema.parse(JSON.parse(readFileSync(path,'utf8')));
   if(item.expires<=now()||item.expires>now()+600000||item.owner!==owner()||proof.length!==item.proof.length||!timingSafeEqual(Buffer.from(proof),Buffer.from(item.proof)))throw Error('Local enrollment authorization expired or invalid');
   unlinkSync(path);for(const [token,value]of grants)if(value.expires<=now())grants.delete(token);
   if(grants.size>=10)throw Error('Too many local setup sessions');
   const token=randomBytes(32).toString('base64url');grants.set(token,{expires:item.expires,owner:item.owner});
   return `${cookieName}=${token}; Path=/icloud; HttpOnly; SameSite=Strict; Max-Age=600`;
  },
  authorize(request:Request){return grant(request);},
  bind(request:Request,user:string){const item=grant(request);if(item.owner&&item.owner!==user||item.user&&item.user!==user)throw Error('Owner mismatch');item.user=user;},
  close(){grants.clear();},
 };
}
/** Owner-authorized, single-use transfer to the configured remote RP; never a replacement credential. */
export function createRemoteOwnerPairing(origin:string,owner:()=>string|null,now=Date.now){
 const tickets=new Map<string,{owner:string;expires:number}>(),sessions=new Map<string,{owner:string;expires:number;user?:string}>();
 const proof=randomBytes(32).toString('base64url');
 const exact=(request:Request)=>{if(new URL(request.url).origin!==origin||request.headers.has('host')&&request.headers.get('host')!==new URL(request.url).host||request.headers.get('origin')!==origin&&!(request.method==='GET'&&!request.headers.has('origin')&&request.headers.get('sec-fetch-site')==='same-origin'))throw Error('Remote origin denied');};
 const grant=(request:Request)=>{exact(request);const token=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('icloud_remote_setup='))?.slice('icloud_remote_setup='.length),item=token?sessions.get(token):undefined;if(!item||item.owner!==owner()||item.expires<=now())throw Error('Remote pairing denied');return item;};
 return{proof,
  issue(user:string){if(user!==owner())throw Error('Owner required');for(const [key,item]of tickets)if(item.expires<=now())tickets.delete(key);if(tickets.size>=10)throw Error('Too many pairing requests');const token=randomBytes(32).toString('base64url');tickets.set(token,{owner:user,expires:now()+300000});return origin+'/icloud/setup?mode=remote-owner#owner-proof='+token;},
  begin(request:Request,token:string){exact(request);const item=tickets.get(token);if(!item||item.owner!==owner()||item.expires<=now())throw Error('Pairing expired');tickets.delete(token);for(const [key,value]of sessions)if(value.expires<=now())sessions.delete(key);if(sessions.size>=10)throw Error('Too many remote setup sessions');const cookie=randomBytes(32).toString('base64url');sessions.set(cookie,item);return `icloud_remote_setup=${cookie}; Path=/icloud; HttpOnly; Secure; SameSite=Strict; Max-Age=300`;},
  authorize:grant,
  bind(request:Request,user:string){const item=grant(request);if(user!==item.owner)throw Error('Owner required');item.user=user;},
  complete(request:Request,user:string){const item=grant(request);if(item.user!==user||user!==owner())throw Error('Owner required');sessions.clear();},
 };
}
