import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Database} from 'bun:sqlite';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteOutboundLedger} from './outbound-ledger.js';
import type {OutboundResult} from '../domain/outbound.js';
const id='12345678-1234-4234-8234-123456789abc',messageId=`<${id}@icloud-plugin.invalid>`;
const key=new Uint8Array(32).fill(9);
test('unfinished and completed receipts survive database reopen without a fresh claim',()=>{
 const dir=mkdtempSync(join(tmpdir(),'outbound-ledger-')),path=join(dir,'ledger.sqlite');let db=new Database(path);
 try{
  let ledger=new SqliteOutboundLedger(db,key,()=> 'owner');assert.deepEqual(ledger.claim(id,'digest',messageId),{fresh:true});db.close();db=new Database(path);ledger=new SqliteOutboundLedger(db,key,()=> 'owner');
  assert.deepEqual(ledger.claim(id,'digest',messageId),{fresh:false,result:{operationId:id,messageId,status:'unknown',replayed:true}});
  ledger.finish(id,{operationId:id,messageId,status:'unknown',replayed:false});db.close();db=new Database(path);ledger=new SqliteOutboundLedger(db,key,()=> 'owner');assert.equal(ledger.claim(id,'digest',messageId).fresh,false);
  assert.throws(()=>ledger.claim(id,'changed digest',messageId),{code:'invalid_input'});
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('encrypted receipt is bound to owner and key and never stores body or recipient plaintext',()=>{
 const dir=mkdtempSync(join(tmpdir(),'outbound-encryption-')),path=join(dir,'ledger.sqlite');const db=new Database(path);
 try{
  const secretBody='Private message body never persisted',digest=createHash('sha256').update(secretBody).digest('hex');
  const ledger=new SqliteOutboundLedger(db,key,()=> 'owner');ledger.claim(id,digest,messageId);
  const receipt:OutboundResult={operationId:id,messageId,status:'submitted',replayed:false,accepted:['secret-recipient@example.invalid'],rejected:[]};ledger.finish(id,receipt);
  assert.deepEqual(ledger.claim(id,digest,messageId),{fresh:false,result:{...receipt,replayed:true}});
  assert.throws(()=>new SqliteOutboundLedger(db,new Uint8Array(32).fill(8),()=> 'owner').claim(id,digest,messageId));
  const other=new SqliteOutboundLedger(db,key,()=> 'other-owner');assert.deepEqual(other.claim(id,digest,messageId),{fresh:true});
  db.query('UPDATE icloudOutbound SET receipt=(SELECT receipt FROM icloudOutbound WHERE owner=?) WHERE owner=?').run('owner','other-owner');
  assert.throws(()=>other.claim(id,digest,messageId));
  assert.equal(readFileSync(path).includes(Buffer.from('secret-recipient@example.invalid')),false);assert.equal(readFileSync(path).includes(Buffer.from(secretBody)),false);
  assert.throws(()=>ledger.finish(id,receipt),/already finalized/);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('module disposal retires ledger access without closing the shared database or altering receipts',()=>{
 const db=new Database(':memory:');try{const ledger=new SqliteOutboundLedger(db,key,()=> 'owner');ledger.claim(id,'digest',messageId);ledger.dispose();ledger.dispose();assert.throws(()=>ledger.claim(id,'digest',messageId),/disposed/);assert.throws(()=>ledger.finish(id,{operationId:id,messageId,status:'unknown',replayed:false}),/disposed/);const replacement=new SqliteOutboundLedger(db,key,()=> 'owner');assert.equal(replacement.claim(id,'digest',messageId).fresh,false);replacement.dispose();}finally{db.close();}
});
