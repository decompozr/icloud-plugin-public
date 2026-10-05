import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SqliteOutboundLedger} from '../mail/storage/outbound-ledger.js';
import {SqliteCalendarLedger} from '../calendar/storage/ledger.js';
import {CustodyError} from './custody-contract.js';

const ids=['12345678-1234-4234-8234-123456789abc','12345678-1234-4234-8234-123456789abd'];
const identities=[{ownerId:'owner',accountId:'active'},{ownerId:'owner',accountId:'retained-revoked'}];
const mailOwners=['owner',...identities.map(identity=>JSON.stringify([identity.ownerId,identity.accountId]))];
function fixture(run:(db:Database,key:Buffer,path:string)=>void){
 const dir=mkdtempSync(join(tmpdir(),'icloud-custody-ledger-validation-')),path=join(dir,'synthetic.sqlite'),db=new Database(path),key=Buffer.alloc(32,17);
 try{run(db,key,path);}finally{db.close();key.fill(0);rmSync(dir,{recursive:true,force:true});}
}
function mail(db:Database,key:Buffer){
 for(const owner of mailOwners){const ledger=new SqliteOutboundLedger(db,key,()=>owner);
  for(const id of ids)ledger.claim(id,'digest','<'+id+'@example.invalid>');
  ledger.finish(ids[0]!,{operationId:ids[0]!,messageId:'<'+ids[0]+'@example.invalid>',status:owner==='owner'?'unknown':'submitted',replayed:false});ledger.dispose();
 }
}
function calendar(db:Database,key:Buffer){
 const ledger=new SqliteCalendarLedger({database:db,masterKey:key});ledger.setPolicy('owner',{read:true,write:false,schedule:false,share:false});
 for(const identity of identities){ledger.begin(identity,{operationId:ids[0]!,fingerprint:'unchanged',command:{operation:'create_calendar',name:'synthetic'},state:'dispatched',updatedAt:'now'});
  ledger.begin(identity,{operationId:ids[1]!,fingerprint:'other',command:{operation:'delete_calendar'},state:'outcome_unknown',updatedAt:'now'});
  ledger.commitSync(identity,'https://example.invalid/cal/',undefined,{token:'preserved-token',snapshot:{events:[]},changes:[]});
 }ledger.close();
}
function validateMail(db:Database,key:Buffer,owners=mailOwners){return SqliteOutboundLedger.validateExistingReceipts({database:db,masterKey:key,allowedOwnerNamespaces:owners});}
function validateCalendar(db:Database,key:Buffer,accounts=identities){return SqliteCalendarLedger.validateExistingPayloads({database:db,masterKey:key,policyOwners:['owner'],accountIdentities:accounts});}
function recovery(run:()=>unknown){try{run();throw Error('Expected rejection');}catch(error){expect(error).toBeInstanceOf(CustodyError);expect((error as CustodyError).code).toBe('recovery_required');expect((error as Error).message).toBe('recovery_required');}}

test('populated readonly ledgers preserve every receipt, dispatch and sync across legacy and retained accounts',()=>fixture((db,key,path)=>{
 mail(db,key);calendar(db,key);const before=readFileSync(path),rows=JSON.stringify(db.query('SELECT * FROM calendar_ledger ORDER BY owner,kind,id').all());
 const readonly=new Database(path,{readonly:true});try{
  expect(validateMail(readonly,key)).toEqual({format:1,records:6,encrypted:3,pending:3});
  expect(validateCalendar(readonly,key)).toEqual({format:1,policies:1,operations:4,sync:2});
 }finally{readonly.close();}
 expect(readFileSync(path)).toEqual(before);expect(JSON.stringify(db.query('SELECT * FROM calendar_ledger ORDER BY owner,kind,id').all())).toBe(rows);expect(key).toEqual(Buffer.alloc(32,17));
 const outbound=new SqliteOutboundLedger(db,key,()=>mailOwners[2]!);expect(outbound.claim(ids[1]!,'digest','<'+ids[1]+'@example.invalid>')).toMatchObject({fresh:false,result:{status:'unknown'}});outbound.dispose();
 const ledger=new SqliteCalendarLedger({database:db,masterKey:key});expect(ledger.operation(identities[1]!,ids[0]!)?.state).toBe('outcome_unknown');expect(ledger.sync(identities[1]!,'https://example.invalid/cal/')?.token).toBe('preserved-token');ledger.close();
}));

test('wrong key, absent schema and omitted retained namespaces fail redacted without creating or repairing state',()=>fixture((db,key)=>{
 recovery(()=>validateMail(db,key));recovery(()=>validateCalendar(db,key));expect(db.query("SELECT name FROM sqlite_master WHERE type='table'").all()).toHaveLength(0);
 mail(db,key);calendar(db,key);const before=JSON.stringify(db.query('SELECT * FROM icloudOutbound').all());const wrong=Buffer.alloc(32,18);
 try{for(let attempt=0;attempt<8;attempt++){recovery(()=>validateMail(db,wrong));recovery(()=>validateCalendar(db,wrong));}}finally{wrong.fill(0);}
 recovery(()=>validateMail(db,key,mailOwners.slice(0,2)));recovery(()=>validateCalendar(db,key,identities.slice(0,1)));
 expect(JSON.stringify(db.query('SELECT * FROM icloudOutbound').all())).toBe(before);
}));

test('mail swapped AAD, corruption and authenticated receipt identity mismatch block validation',()=>fixture((db,key)=>{
 mail(db,key);const row=db.query<{receipt:Uint8Array},[]>("SELECT receipt FROM icloudOutbound WHERE owner='owner' AND receipt IS NOT NULL").get()!;
 db.query('UPDATE icloudOutbound SET receipt=? WHERE owner=? AND operation=?').run(row.receipt,mailOwners[1]!,ids[0]!);recovery(()=>validateMail(db,key));
 db.query('UPDATE icloudOutbound SET receipt=NULL WHERE owner=? AND operation=?').run(mailOwners[1]!,ids[0]!);
 const ledger=new SqliteOutboundLedger(db,key,()=>mailOwners[1]!);ledger.finish(ids[0]!,{operationId:ids[1]!,messageId:'wrong',status:'unknown',replayed:false});ledger.dispose();recovery(()=>validateMail(db,key));
 db.query('UPDATE icloudOutbound SET receipt=? WHERE owner=? AND operation=?').run(new Uint8Array([1,2,3]),mailOwners[1]!,ids[0]!);recovery(()=>validateMail(db,key));
}));

test('pending-only mail inventory is counted without pretending to authenticate a key',()=>fixture((db,key)=>{
 const ledger=new SqliteOutboundLedger(db,key,()=> 'owner');ledger.claim(ids[0]!,'digest','message');ledger.dispose();
 const wrong=Buffer.alloc(32,19);try{expect(validateMail(db,wrong)).toEqual({format:1,records:1,encrypted:0,pending:1});}finally{wrong.fill(0);}
}));

for(const kind of ['policy','operation','sync'])test('calendar '+kind+' ciphertext corruption blocks the entire retained inventory',()=>fixture((db,key)=>{
 calendar(db,key);db.query('UPDATE calendar_ledger SET payload=? WHERE kind=?').run('{"iv":"bad","tag":"bad","data":"bad"}',kind);
 recovery(()=>validateCalendar(db,key));expect(db.query('SELECT count(*) AS n FROM calendar_ledger').get()).toEqual({n:7});
}));

test('calendar authenticates row AAD and rejects unsupported kind and operation shape',()=>fixture((db,key)=>{
 calendar(db,key);const row=db.query<{owner:string;id:string;payload:string},[]>("SELECT owner,id,payload FROM calendar_ledger WHERE kind='operation' LIMIT 1").get()!;
 db.query("UPDATE calendar_ledger SET id='swapped' WHERE owner=? AND kind='operation' AND id=?").run(row.owner,row.id);recovery(()=>validateCalendar(db,key));
 db.query("UPDATE calendar_ledger SET id=? WHERE owner=? AND kind='operation' AND id='swapped'").run(row.id,row.owner);
 db.query("UPDATE calendar_ledger SET kind='unsupported' WHERE kind='sync'").run();recovery(()=>validateCalendar(db,key));
 db.query("UPDATE calendar_ledger SET kind='sync' WHERE kind='unsupported'").run();
 const ledger=new SqliteCalendarLedger({database:db,masterKey:key});ledger.save(identities[0]!,{operationId:'shape',fingerprint:'x',command:{},state:'broken',updatedAt:'now'} as never);recovery(()=>validateCalendar(db,key));
 ledger.close();
}));
