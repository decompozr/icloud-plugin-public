import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ownerAuthSecret,resourceClientStorageId,sealResourceClient,openResourceClient,validateResourceClientCiphertexts} from './key-contexts.js';
import {createOwnerAuth} from './owner.js';

const legacySecret=(key:Uint8Array,mode='owner-auth-v1')=>createHash('sha256').update(key).update(mode).digest('hex');
function legacySeal(secret:string,value:string){const key=createHash('sha256').update(secret).update('icloud-resource-client-v1').digest(),nonce=Buffer.alloc(12,3),cipher=createCipheriv('aes-256-gcm',key,nonce);
 try{const data=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);return JSON.stringify({nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),value:data.toString('base64')});}finally{key.fill(0);}}
function legacyOpen(secret:string,value:string){const key=createHash('sha256').update(secret).update('icloud-resource-client-v1').digest(),item=JSON.parse(value),decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(item.nonce,'base64'));
 try{decipher.setAuthTag(Buffer.from(item.tag,'base64'));return Buffer.concat([decipher.update(Buffer.from(item.value,'base64')),decipher.final()]).toString();}finally{key.fill(0);}}

test('remote/local contexts and old/new resource-client envelopes remain interoperable',()=>{
 const key=randomBytes(32);try{
  const remote=legacySecret(key),local=legacySecret(key,'local-owner-auth-v1');
  expect(ownerAuthSecret(key,'remote')).toBe(remote);expect(ownerAuthSecret(key,'local')).toBe(local);expect(remote).not.toBe(local);
  const plain=JSON.stringify({client_id:'synthetic-id',client_secret:'synthetic-secret'}),old=legacySeal(remote,plain);
  expect(openResourceClient(remote,old)).toBe(plain);expect(legacyOpen(remote,sealResourceClient(remote,plain))).toBe(plain);
  expect(()=>openResourceClient(local,old)).toThrow(/^recovery_required$/);
  expect(()=>ownerAuthSecret(Buffer.alloc(31),'remote')).toThrow('invalid_input');
 }finally{key.fill(0);}
});
test('readonly snapshot validates all retained clients and required origin/resource slot without rewriting or registration',()=>{
 const directory=mkdtempSync(join(tmpdir(),'icloud-custody-auth-validation-')),path=join(directory,'auth.sqlite'),key=randomBytes(32);
 let db=new Database(path);try{
  db.exec('CREATE TABLE plugin_auth_private(id TEXT PRIMARY KEY,value TEXT NOT NULL)');
  const required=resourceClientStorageId('https://icloud.invalid/icloud/auth','https://icloud.invalid/icloud/mcp'),secret=legacySecret(key);
  for(const id of [required,'resource-client'])db.query('INSERT INTO plugin_auth_private VALUES(?,?)').run(id,legacySeal(secret,JSON.stringify({client_id:id,client_secret:'synthetic-retained'})));
  db.close();db=new Database(path,{readonly:true,create:false});const before=readFileSync(path);
  expect(validateResourceClientCiphertexts({database:db,masterKey:key,requiredRecordId:required})).toEqual({format:1,records:2});expect(readFileSync(path)).toEqual(before);
  expect(()=>validateResourceClientCiphertexts({database:db,masterKey:key,requiredRecordId:resourceClientStorageId('https://different.invalid/icloud/auth','https://icloud.invalid/icloud/mcp')})).toThrow('recovery_required');
  expect(db.query('SELECT count(*) AS count FROM plugin_auth_private').get()).toEqual({count:2});expect(key.some(byte=>byte!==0)).toBe(true);
 }finally{db.close();key.fill(0);rmSync(directory,{recursive:true});}
});
test('wrong key, corrupt retained ciphertext or client shape and missing schema fail redacted without repair',()=>{
 const key=randomBytes(32),db=new Database(':memory:'),required=resourceClientStorageId('issuer','resource');try{
  expect(()=>validateResourceClientCiphertexts({database:db,masterKey:key,requiredRecordId:required})).toThrow(/^recovery_required$/);
  expect(db.query('SELECT name FROM sqlite_master').all()).toEqual([]);db.exec('CREATE TABLE plugin_auth_private(id TEXT PRIMARY KEY,value TEXT NOT NULL)');
  const good=legacySeal(legacySecret(key),JSON.stringify({client_id:'synthetic',client_secret:'synthetic-secret'}));db.query('INSERT INTO plugin_auth_private VALUES(?,?)').run(required,good);
  expect(()=>validateResourceClientCiphertexts({database:db,masterKey:randomBytes(32),requiredRecordId:required})).toThrow(/^recovery_required$/);
  for(const value of ['synthetic-sensitive-diagnostic',legacySeal(legacySecret(key),JSON.stringify({client_id:'synthetic'}))]){
   db.query('INSERT OR REPLACE INTO plugin_auth_private VALUES(?,?)').run('retained-old',value);
   expect(()=>validateResourceClientCiphertexts({database:db,masterKey:key,requiredRecordId:required})).toThrow(/^recovery_required$/);
   expect(db.query('SELECT value FROM plugin_auth_private WHERE id=?').get(required)).toEqual({value:good});
  }
 }finally{db.close();key.fill(0);}
});
test('actual auth factory ciphertext survives validator and ordinary reopen without replacement internal client',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'icloud-custody-auth-validation-')),path=join(directory,'auth.sqlite'),key=randomBytes(32);
 let db=new Database(path);try{
  const base='https://icloud.invalid',resource=base+'/icloud/mcp',required=resourceClientStorageId(base+'/icloud/auth',resource);
  const settings={publicBaseURL:base,privateOrigin:base,rpID:'icloud.invalid',secret:ownerAuthSecret(key,'remote'),resource,scopes:['mail.read'],ownerId:()=>undefined,checkBootstrapProof:()=>{throw Error('Not exercised');}};
  const first=await createOwnerAuth({...settings,database:db});await first.publicHandler(new Request(base+'/icloud/auth/get-session'));
  const row=db.query('SELECT value FROM plugin_auth_private WHERE id=?').get(required),clients=db.query('SELECT count(*) AS count FROM oauthClient').get();
  expect(validateResourceClientCiphertexts({database:db,masterKey:key,requiredRecordId:required})).toEqual({format:1,records:1});
  db.close();db=new Database(path,{readwrite:true,create:false});const reopened=await createOwnerAuth({...settings,database:db});
  // Stored-client startup can return before Better Auth's lazy context settles.
  // A real awaited handler call is the lifetime barrier before closing this DB.
  await reopened.publicHandler(new Request(base+'/icloud/auth/get-session'));
  expect(db.query('SELECT value FROM plugin_auth_private WHERE id=?').get(required)).toEqual(row);expect(db.query('SELECT count(*) AS count FROM oauthClient').get()).toEqual(clients);
 }finally{db.close();key.fill(0);rmSync(directory,{recursive:true});}
});
