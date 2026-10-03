import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Database} from 'bun:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteOperatorPolicy,type CapabilityPolicy} from './operator-policy.js';
const initial:CapabilityPolicy={read:true,write:false,send:false,unsubscribe:false};
test('persisted policy survives reopen and ignores changed initial configuration',()=>{
 const directory=mkdtempSync(join(tmpdir(),'operator-policy-')),path=join(directory,'state.sqlite');let database=new Database(path);
 try{
  const first=new SqliteOperatorPolicy(database,initial);assert.deepEqual(first.snapshot(),initial);
  const changed={read:false,write:true,send:true,unsubscribe:false};first.update(changed,true);database.close();database=new Database(path);
  assert.deepEqual(new SqliteOperatorPolicy(database,initial).snapshot(),changed);
 }finally{database.close();rmSync(directory,{recursive:true,force:true});}
});
test('enabling any capability requires explicit confirmation and rejection is atomic',()=>{
 const database=new Database(':memory:');try{
  const policy=new SqliteOperatorPolicy(database,initial);
  for(const capability of ['write','send','unsubscribe'] as const){assert.throws(()=>policy.update({...initial,read:false,[capability]:true},false),{code:'forbidden'});assert.deepEqual(policy.snapshot(),initial);}
  policy.update({...initial,read:false},false);
  assert.throws(()=>policy.update(initial,false),{code:'forbidden'});
  assert.deepEqual(policy.update({read:true,write:true,send:true,unsubscribe:true},true),{read:true,write:true,send:true,unsubscribe:true});
 }finally{database.close();}
});
test('disabling read takes effect immediately without rewriting other flags or OAuth state',()=>{
 const database=new Database(':memory:');try{
  database.exec("CREATE TABLE oauthTest(id TEXT PRIMARY KEY, token TEXT); INSERT INTO oauthTest VALUES('owner','unchanged-secret')");
  const all={read:true,write:true,send:true,unsubscribe:true},policy=new SqliteOperatorPolicy(database,all);
  assert.deepEqual(policy.update({...all,read:false},false),{...all,read:false});
  const observer=new SqliteOperatorPolicy(database,initial);assert.deepEqual(observer.snapshot(),{...all,read:false});
  assert.deepEqual(database.query('SELECT * FROM oauthTest').all(),[{id:'owner',token:'unchanged-secret'}]);
  assert.deepEqual(policy.update({read:false,write:false,send:false,unsubscribe:false},false),{read:false,write:false,send:false,unsubscribe:false});
 }finally{database.close();}
});
test('strict validation rejects extra fields and nonboolean values without changing state',()=>{
 const database=new Database(':memory:');try{
  const policy=new SqliteOperatorPolicy(database,initial);
  const extra={...initial,token:'not allowed'};
  assert.throws(()=>policy.update(extra,true),{code:'invalid_input'});
  // Runtime callers must be validated even when they bypass TypeScript.
  assert.throws(()=>Reflect.apply(policy.update,policy,[{...initial,read:'true'},true]),{code:'invalid_input'});
  assert.deepEqual(policy.snapshot(),initial);
 }finally{database.close();}
});
