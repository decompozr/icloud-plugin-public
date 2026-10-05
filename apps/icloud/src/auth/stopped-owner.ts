import type {Database} from 'bun:sqlite';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {InstallationAccess} from '../server/installation-access.js';
import {CustodyError} from '../storage/custody-contract.js';

/** Read-only authorization using the installed Better Auth signed-session
 * cookie format and persisted session/user rows. Caller supplies the exact
 * existing auth derivation, configured cookie name/origin, authenticated owner
 * binding and safely opened retained DB. No enrollment, schema migrations,
 * session refresh/cache, native API or runtime factory is invoked here.
 * Requires real cooperative stopped exclusion; excludes neither hostile same-
 * user writers nor older custom writers. K0 caller sealing remains required.
 */
export function createStoppedOwnerAuthorization(options:{
 database:Database;access:InstallationAccess;custodyDirectory:string;
 request:Request;origin:string;cookieName:string;secret:string;
 ownerId():string|null|undefined;now?():number;
}):Readonly<{ownerId:string;assertAuthorized():void}> {
 try{
  const {database,access,custodyDirectory}=options,now=options.now??Date.now,owner=options.ownerId;
  access.assertStoppedMaintenanceFor(custodyDirectory);
  const origin=new URL(options.origin).origin;
  const url=new URL(options.request.url),host=options.request.headers.get('host');
  if(origin!==options.origin||url.origin!==origin||options.request.headers.get('origin')!==origin||host!==null&&host!==url.host)throw new CustodyError('denied');
  if(options.secret.length<32||!options.cookieName.endsWith('.session_token')||options.cookieName.length>128)throw new CustodyError('invalid_input');
  const ownerId=owner();if(!ownerId)throw new CustodyError('denied');
  const cookies=options.request.headers.get('cookie')??'';if(cookies.length>8192)throw new CustodyError('denied');
  const matches=cookies.split(';').map(value=>value.trim()).filter(value=>value.slice(0,value.indexOf('='))===options.cookieName);
  if(matches.length!==1)throw new CustodyError('denied');
  const cookie=decodeURIComponent(matches[0]!.slice(options.cookieName.length+1)),separator=cookie.lastIndexOf('.');
  if(separator<1)throw new CustodyError('denied');
  const token=cookie.slice(0,separator),signature=cookie.slice(separator+1);
  if(token.length>4096||!/^[A-Za-z0-9+/]{43}=$/.test(signature))throw new CustodyError('denied');
  const expected=createHmac('sha256',options.secret).update(token).digest(),actual=Buffer.from(signature,'base64');
  try{if(actual.length!==expected.length||actual.toString('base64')!==signature||!timingSafeEqual(actual,expected))throw new CustodyError('denied');}
  finally{actual.fill(0);expected.fill(0);}
  const expiry=(value:unknown)=>{
   if(typeof value==='number'&&Number.isSafeInteger(value))return value;
   if(typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value))return Date.parse(value);
   throw new CustodyError('denied');
  };
  const current=()=>{
   access.assertStoppedMaintenanceFor(custodyDirectory);
   if(owner()!==ownerId)throw new CustodyError('denied');
   const rows=database.query('SELECT s.id,s.userId,s.expiresAt FROM session s JOIN "user" u ON u.id=s.userId WHERE s.token=?').all(token) as {id:unknown;userId:unknown;expiresAt:unknown}[];
   if(rows.length!==1||typeof rows[0]!.id!=='string'||!rows[0]!.id||rows[0]!.userId!==ownerId)throw new CustodyError('denied');
   const expiresAt=expiry(rows[0]!.expiresAt),time=now();
   if(!Number.isFinite(time)||!Number.isFinite(expiresAt)||expiresAt<=time)throw new CustodyError('denied');
   access.assertStoppedMaintenanceFor(custodyDirectory);
   return{id:rows[0]!.id,expiresAt};
  };
  const initial=current();
  return Object.freeze({ownerId,assertAuthorized(){
   try{const actual=current();if(actual.id!==initial.id||actual.expiresAt!==initial.expiresAt)throw new CustodyError('denied');}
   catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('denied');}
  }});
 }catch(error){if(error instanceof CustodyError)throw error;throw new CustodyError('denied');}
}
