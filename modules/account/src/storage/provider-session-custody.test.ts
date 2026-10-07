import {test,expect} from 'bun:test';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {Database} from 'bun:sqlite';
import {SqliteOwnerStore} from './owner-store.js';

function fixture(){
 const directory=mkdtempSync(join(tmpdir(),'icloud-session-custody-'));
 const options={databasePath:join(directory,'owner.sqlite'),markerPath:join(directory,'marker'),masterKey:randomBytes(32),bootstrapProof:randomBytes(32).toString('hex')};
 const store=SqliteOwnerStore.provision(options);store.enroll({proof:options.bootstrapProof,ownerId:'owner'});
 const a=store.addAccount('owner',{user:'a@example.test',credential:Buffer.from('mail-a-only')});
 const b=store.addAccount('owner',{user:'b@example.test',credential:Buffer.from('mail-b-only')});
 return {store,options,a:a.id,b:b.id,cleanup:()=>rmSync(directory,{recursive:true})};
}
test('provider sessions persist encrypted without replacing Mail credentials or crossing accounts',()=>{
 const f=fixture();let store=f.store;
 try{
  const before=store.providerSessionState('owner',f.a,'photos_web');expect(before).toEqual({accountRevision:1,generation:0,stored:false});
  const after=store.replaceProviderSession('owner',f.a,'photos_web',before,Buffer.from('private-photo-session-fixture'));
  expect(after).toEqual({accountRevision:1,generation:1,stored:true});
  expect(store.readProviderSession('owner',f.b,'photos_web')).toBeNull();
  expect(()=>store.readProviderSession('foreign-owner',f.a,'photos_web')).toThrow('OWNER_DENIED');
  expect(()=>store.readProviderSession('owner',f.a,'mail' as any)).toThrow('INVALID_INPUT');
  expect(Buffer.from(store.readAccountSecret('owner',f.a)!).toString()).toBe('mail-a-only');
  store.close();expect(readFileSync(f.options.databasePath).includes(Buffer.from('private-photo-session-fixture'))).toBe(false);
  store=SqliteOwnerStore.open(f.options);
  expect(Buffer.from(store.readProviderSession('owner',f.a,'photos_web')!.bytes).toString()).toBe('private-photo-session-fixture');
  expect(store.providerSessionState('owner',f.a,'photos_web')).toEqual(after);
 }finally{store.close();f.cleanup();}
});
test('revocation tombstone and credential revisions reject stale login completions across reopen',()=>{
 const f=fixture();let store=f.store;
 try{
  const pending=store.providerSessionState('owner',f.a,'photos_web');
  const revoked=store.revokeProviderSession('owner',f.a,'photos_web',pending);
  expect(revoked.generation).toBe(1);expect(revoked.stored).toBe(false);
  store.close();store=SqliteOwnerStore.open(f.options);
  expect(()=>store.replaceProviderSession('owner',f.a,'photos_web',pending,Buffer.from('stale-login'))).toThrow('INVALID_INPUT');
  store.replaceProviderSession('owner',f.a,'photos_web',revoked,Buffer.from('active-session'));
  const pendingAgain=store.providerSessionState('owner',f.a,'photos_web');
  store.rotateAccountSecret('owner',f.a,Buffer.from('rotated-mail'));
  expect(store.providerSessionState('owner',f.a,'photos_web').generation).toBeGreaterThan(pendingAgain.generation);
  expect(store.readProviderSession('owner',f.a,'photos_web')).toBeNull();
  expect(store.providerSessionState('owner',f.a,'photos_web').stored).toBe(false);
  expect(()=>store.replaceProviderSession('owner',f.a,'photos_web',pendingAgain,Buffer.from('late-auth'))).toThrow('INVALID_INPUT');
  const fresh=store.providerSessionState('owner',f.a,'photos_web');store.replaceProviderSession('owner',f.a,'photos_web',fresh,Buffer.from('reauthenticated'));
  store.revokeAccountSecret('owner',f.a);expect(store.readProviderSession('owner',f.a,'photos_web')).toBeNull();
  expect(Buffer.from(store.readAccountSecret('owner',f.b)!).toString()).toBe('mail-b-only');
 }finally{store.close();f.cleanup();}
});
test('ciphertext transplantation, tampering and revision manipulation fail authenticated decryption',()=>{
 const f=fixture();const store=f.store;const db=new Database(f.options.databasePath);
 try{
  for(const id of [f.a,f.b])store.replaceProviderSession('owner',id,'photos_web',store.providerSessionState('owner',id,'photos_web'),Buffer.from('synthetic-session-'+id));
  const a=db.query('SELECT secret FROM provider_sessions WHERE account=?').get(f.a) as {secret:string};
  db.query('UPDATE provider_sessions SET secret=? WHERE account=?').run(a.secret,f.b);
  expect(()=>store.readProviderSession('owner',f.b,'photos_web')).toThrow('SECRET_UNAVAILABLE');
  db.query('UPDATE provider_sessions SET generation=generation+1 WHERE account=?').run(f.a);
  expect(()=>store.readProviderSession('owner',f.a,'photos_web')).toThrow('SECRET_UNAVAILABLE');
  db.query("UPDATE provider_sessions SET secret='{}' WHERE account=?").run(f.a);
  expect(()=>store.readProviderSession('owner',f.a,'photos_web')).toThrow('SECRET_UNAVAILABLE');
 }finally{db.close();store.close();f.cleanup();}
});
test('transaction failure preserves the prior generation and redacts errors',()=>{
 const f=fixture();const store=f.store;const db=new Database(f.options.databasePath);
 try{
  const initial=store.providerSessionState('owner',f.a,'photos_web');
  const ready=store.replaceProviderSession('owner',f.a,'photos_web',initial,Buffer.from('prior-session'));
  db.exec("CREATE TRIGGER fail_session_update BEFORE UPDATE ON provider_sessions BEGIN SELECT RAISE(ABORT,'private-cookie-must-not-leak'); END");
  expect(()=>store.revokeProviderSession('owner',f.a,'photos_web',ready)).toThrow('STATE_UNAVAILABLE');
  expect(()=>store.rotateAccountSecret('owner',f.a,Buffer.from('would-rotate-mail'))).toThrow('STATE_UNAVAILABLE');
  expect(Buffer.from(store.readAccountSecret('owner',f.a)!).toString()).toBe('mail-a-only');
  expect(store.providerSessionState('owner',f.a,'photos_web')).toEqual(ready);
  expect(Buffer.from(store.readProviderSession('owner',f.a,'photos_web')!.bytes).toString()).toBe('prior-session');
  expect(()=>store.replaceProviderSession('owner',f.b,'photos_web',initial,new Uint8Array(65537))).toThrow('INVALID_INPUT');
 }finally{db.close();store.close();f.cleanup();}
});
test('two independently opened stores cannot overwrite the same pending session generation',()=>{
 const f=fixture();const other=SqliteOwnerStore.open(f.options);
 try{
  const first=f.store.providerSessionState('owner',f.a,'photos_web');
  const second=other.providerSessionState('owner',f.a,'photos_web');
  f.store.replaceProviderSession('owner',f.a,'photos_web',first,Buffer.from('winner-session'));
  expect(()=>other.replaceProviderSession('owner',f.a,'photos_web',second,Buffer.from('loser-session'))).toThrow('INVALID_INPUT');
  expect(Buffer.from(other.readProviderSession('owner',f.a,'photos_web')!.bytes).toString()).toBe('winner-session');
  const fresh=other.providerSessionState('owner',f.a,'photos_web');other.revokeProviderSession('owner',f.a,'photos_web',fresh);
  expect(f.store.readProviderSession('owner',f.a,'photos_web')).toBeNull();
 }finally{other.close();f.store.close();f.cleanup();}
});
