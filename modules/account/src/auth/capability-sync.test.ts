import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {synchronizeClientCapabilities,updatedAuthorizationScopes} from './capability-sync.js';
function fixture(){
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE oauthClient(clientId TEXT PRIMARY KEY,userId TEXT,scopes TEXT,disabled INTEGER);
 CREATE TABLE oauthConsent(id TEXT,clientId TEXT,userId TEXT,referenceId TEXT,scopes TEXT);
 CREATE TABLE oauthAccessToken(id TEXT,clientId TEXT,userId TEXT);
 CREATE TABLE oauthRefreshToken(id TEXT,clientId TEXT,userId TEXT);
 CREATE TABLE verification(value TEXT);`);
 const before=['mail.read','mail.write','offline_access'],enabled=[...before,'homekit.read','homekit.control','homekit.scenes'];
 const add=(id:string,user:string|null,grantOwner='owner',account='account')=>{db.query('INSERT INTO oauthClient VALUES(?,?,?,0)').run(id,user,JSON.stringify(before));db.query('INSERT INTO oauthConsent VALUES(?,?,?,?,?)').run(id,id,grantOwner,account,JSON.stringify(before));};
 const sync=()=>synchronizeClientCapabilities({database:db,owner:'owner',declared:[...enabled,'disabled.write'],enabled,validAccount:(owner,account)=>owner==='owner'&&account==='account'});
 return{db,before,enabled,add,sync};
}
test('module capability sync updates eligible ceilings once without changing any grants',()=>{
 const f=fixture();try{
  f.add('owned','owner');f.add('anonymous',null);f.add('foreign','other','other');f.add('stale',null,'owner','missing');f.add('disabled','owner');f.db.exec("UPDATE oauthClient SET disabled=1 WHERE clientId='disabled'");
  f.add('shared','owner');f.db.query('INSERT INTO oauthAccessToken VALUES(?,?,?)').run('foreign-token','shared','other');
  f.add('foreign-code','owner');f.db.query('INSERT INTO verification VALUES(?)').run(JSON.stringify({type:'authorization_code',userId:'other',query:{client_id:'foreign-code'}}));
  const grants=f.db.query('SELECT * FROM oauthConsent').all();f.sync();f.sync();
  for(const id of ['owned','anonymous'])expect(JSON.parse((f.db.query('SELECT scopes FROM oauthClient WHERE clientId=?').get(id) as {scopes:string}).scopes)).toEqual(f.enabled);
  for(const id of ['foreign','stale','disabled','shared','foreign-code'])expect(JSON.parse((f.db.query('SELECT scopes FROM oauthClient WHERE clientId=?').get(id) as {scopes:string}).scopes)).toEqual(f.before);
  expect(f.db.query('SELECT * FROM oauthConsent').all()).toEqual(grants);expect(f.db.query('SELECT count(*) AS n FROM plugin_client_scope_audit').get()).toEqual({n:2});
 }finally{f.db.close();}
});
test('cached complete reconnect snapshot is updated; narrow and foreign requests retain their scopes',()=>{
 const f=fixture();try{
  f.add('client',null);f.sync();
  expect(updatedAuthorizationScopes(f.db,'owner','client',f.before,f.enabled)).toEqual(f.enabled);
  expect(updatedAuthorizationScopes(f.db,'owner','client',['homekit.read'],f.enabled)).toEqual(['homekit.read']);
  f.db.query('INSERT INTO plugin_client_scope_audit VALUES(?,?,?,?,?,?)').run('read-only','owner','client',JSON.stringify(['mail.read']),JSON.stringify(f.enabled),'fixture');
  expect(updatedAuthorizationScopes(f.db,'owner','client',['mail.read'],f.enabled)).toEqual(['mail.read']);
  expect(updatedAuthorizationScopes(f.db,'other','client',f.before,f.enabled)).toEqual(f.before);
  expect(updatedAuthorizationScopes(f.db,'owner','client',f.before,f.before)).toEqual(f.before);
  f.db.query('INSERT INTO oauthRefreshToken VALUES(?,?,?)').run('foreign','client','other');
  expect(updatedAuthorizationScopes(f.db,'owner','client',f.before,f.enabled)).toEqual(f.before);
 }finally{f.db.close();}
});
