// Synthetic SQLite process-interruption fixture only; never imported by runtime.
import {Database} from 'bun:sqlite';
import {SqliteOwnerStore} from './owner-store.js';
import {AccountAuthorityJournal} from './account-authority.js';
const input=JSON.parse(await Bun.stdin.text()) as {databasePath:string;markerPath:string;key:string;installationId:string;accountId:string;epoch:number;operationId:string;checkpoint:string};
const key=Buffer.from(input.key,'hex'),owner=SqliteOwnerStore.open({databasePath:input.databasePath,markerPath:input.markerPath,masterKey:key});
const db=new Database(input.databasePath,{create:false,readwrite:true});db.exec('PRAGMA synchronous=FULL');
const journal=AccountAuthorityJournal.open(db,input.installationId,key,owner);
if(input.checkpoint==='before_commit'){
 // Test-only interception: exit after the real pointer statement executes but
 // before its surrounding transaction returns/commits. No production fault API.
 const query=db.query.bind(db);
 db.query=((sql:string)=>{
  const statement=query(sql);
  if(!sql.startsWith('INSERT INTO account_custody_state'))return statement;
  return new Proxy(statement,{get(target,property){
   if(property==='run')return (...args:Parameters<typeof statement.run>)=>{target.run(...args);process.exit(73);};
   const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
  }});
 }) as typeof db.query;
}
journal.activate('owner',input.accountId,input.epoch,input.operationId);
if(input.checkpoint==='after_commit')process.exit(73);
throw Error('Fixture checkpoint not reached');
