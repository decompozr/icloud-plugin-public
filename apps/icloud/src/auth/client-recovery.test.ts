import {test,expect} from 'bun:test';
import {Database} from 'bun:sqlite';
import {createClientRecovery,withOAuthMutation} from './client-recovery.js';
function fixture(){
 const db=new Database(':memory:');
 db.exec(`CREATE TABLE oauthClient(clientId TEXT PRIMARY KEY,name TEXT,userId TEXT,scopes TEXT,disabled INTEGER);
 CREATE TABLE session(id TEXT,userId TEXT,expiresAt INTEGER);
 CREATE TABLE oauthAccessToken(id TEXT PRIMARY KEY,clientId TEXT,userId TEXT,referenceId TEXT,scopes TEXT,expiresAt INTEGER,createdAt INTEGER,sessionId TEXT,revoked INTEGER);
 CREATE TABLE oauthRefreshToken(id TEXT PRIMARY KEY,clientId TEXT,userId TEXT,referenceId TEXT,scopes TEXT,expiresAt INTEGER,createdAt INTEGER,sessionId TEXT,revoked INTEGER);
 CREATE TABLE oauthConsent(id TEXT PRIMARY KEY,clientId TEXT,userId TEXT,referenceId TEXT,scopes TEXT);
 CREATE TABLE verification(id TEXT PRIMARY KEY,value TEXT);
 CREATE TABLE accounts(id TEXT PRIMARY KEY,credential TEXT);`);
 db.query('INSERT INTO session VALUES(?,?,?)').run('s','owner',Date.now()+3600000);
 for(const c of ['a','b']){
  db.query('INSERT INTO oauthClient VALUES(?,?,?,?,0)').run(c,c==='a'?'Codex':'ChatGPT','owner',JSON.stringify(['mail.read','mail.send','calendar.read']));
  for(const t of ['oauthAccessToken','oauthRefreshToken'])db.query('INSERT INTO '+t+' VALUES(?,?,?,?,?,?,?,?,NULL)').run(c,c,'owner','account',JSON.stringify(['mail.read','mail.send','calendar.read']),Date.now()+3600000,Date.now(),'s');
  db.query('INSERT INTO oauthConsent VALUES(?,?,?,?,?)').run(c,c,'owner','account',JSON.stringify(['mail.read','calendar.read']));
  db.query('INSERT INTO verification VALUES(?,?)').run(c,JSON.stringify({type:'authorization_code',userId:'owner',query:{client_id:c}}));
 }
 db.query('INSERT INTO accounts VALUES(?,?)').run('account','fixture-secret-preserved');
 const handle=createClientRecovery({database:db,origin:'https://private.example',origins:['https://private.example','http://localhost:3000'],declaredScopes:['mail.read','calendar.read'],allowedScopes:()=>['mail.read'],validAccount:(_owner,id)=>id==='account',ownerSession:async headers=>{if(headers.get('cookie')!=='owner')throw Error();return{user:{id:'owner'}};},updateClient:async()=>{}});
 const request=(query='',body?:unknown,origin='https://private.example',cookie='owner',host?:string)=>handle(new Request(origin+'/icloud/admin/oauth-clients'+query,{method:body?'POST':'GET',headers:{origin,cookie,...(host?{host}:{}),...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}));
 return{db,request,handle};
}
test('connections require active account token session consent ceiling and policy intersection',async()=>{
 const {db,request}=fixture();try{
  let data=await(await request()).json();expect(data.connections).toHaveLength(2);expect(data.connections[0].grantedScopes).toEqual(['mail.read']);expect(data.connections[0].name).toBe('Codex');
  db.exec("UPDATE oauthClient SET disabled=1 WHERE clientId='a'");expect((await(await request()).json()).connections).toHaveLength(1);
  db.exec("UPDATE oauthRefreshToken SET revoked=1 WHERE clientId='b'; UPDATE oauthAccessToken SET referenceId='missing' WHERE clientId='b'");expect((await(await request()).json()).connections).toHaveLength(0);
  db.exec("UPDATE oauthAccessToken SET referenceId='account'; UPDATE oauthClient SET disabled=0; UPDATE oauthRefreshToken SET revoked=1; DELETE FROM session");expect((await(await request()).json()).connections).toHaveLength(0);
 }finally{db.close();}
});
test('confirmed revoke deletes related tokens consent codes and preserves unrelated clients and credentials',async()=>{
 const {db,request}=fixture();try{
  const before=db.query('SELECT * FROM accounts').all(),tables=['oauthClient','oauthAccessToken','oauthRefreshToken','oauthConsent','verification'];
  const other=()=>tables.map(t=>db.query('SELECT * FROM '+t+' WHERE '+(t==='verification'?'id':'clientId')+"='b'").all()),snapshot=other();
  const preview=await(await request('?clientId=a&action=revoke')).json();expect(preview.impact).toMatchObject({accessTokens:1,refreshTokens:1,consents:1,authorizationCodes:1,accountsPreserved:true});
  expect((await request('',{clientId:'a',action:'revoke',confirm:true})).status).toBe(400);
  const body={clientId:'a',action:'revoke',confirm:true,confirmation:preview.confirmation};expect((await request('',body)).status).toBe(200);expect((await request('',body)).status).toBe(409);
  for(const t of ['oauthAccessToken','oauthRefreshToken','oauthConsent'])expect(db.query('SELECT * FROM '+t+" WHERE clientId='a'").all()).toHaveLength(0);
  expect(db.query("SELECT * FROM verification WHERE id='a'").all()).toHaveLength(0);expect(db.query("SELECT * FROM oauthClient WHERE clientId='a'").all()).toHaveLength(1);expect(db.query('SELECT * FROM accounts').all()).toEqual(before);expect(other()).toEqual(snapshot);expect(db.query('SELECT action FROM plugin_client_management_audit').all()).toEqual([{action:'revoke'}]);
 }finally{db.close();}
});
test('remove rejects stale impact and shared registration, then atomically removes independent client',async()=>{
 const {db,request}=fixture();try{
  const preview=await(await request('?clientId=a&action=remove')).json();db.exec("UPDATE oauthConsent SET scopes='[]' WHERE clientId='a'");expect((await request('',{clientId:'a',action:'remove',confirm:true,confirmation:preview.confirmation})).status).toBe(409);expect(db.query("SELECT * FROM oauthAccessToken WHERE clientId='a'").all()).toHaveLength(1);
  db.query('INSERT INTO oauthConsent VALUES(?,?,?,?,?)').run('foreign','a','other','other-account','[]');expect((await request('?clientId=a&action=remove')).status).toBe(409);db.exec("DELETE FROM oauthConsent WHERE id='foreign'");
  const fresh=await(await request('?clientId=a&action=remove')).json();expect((await request('',{clientId:'a',action:'remove',confirm:true,confirmation:fresh.confirmation})).status).toBe(200);expect(db.query("SELECT * FROM oauthClient WHERE clientId='a'").all()).toHaveLength(0);expect(db.query('SELECT * FROM accounts').all()).toHaveLength(1);
 }finally{db.close();}
});
test('management requires exact request origin Host owner and mutation Origin; local entry is supported',async()=>{
 const {db,request,handle}=fixture();try{
  expect((await request('','','https://evil.example')).status).toBe(403);expect((await request('','','https://private.example','')).status).toBe(403);expect((await request('','','https://private.example','owner','evil.example')).status).toBe(403);expect((await request('','','http://localhost:3000')).status).toBe(200);
  expect((await handle(new Request('https://private.example/icloud/admin/oauth-clients',{method:'POST',headers:{cookie:'owner','content-type':'application/json'},body:'{}'}))).status).toBe(403);
 }finally{db.close();}
});
test('transaction rolls back all revocation if registration removal fails',async()=>{
 const {db,request}=fixture();try{
  db.exec("CREATE TRIGGER reject_removal BEFORE DELETE ON oauthClient BEGIN SELECT RAISE(ABORT,'fixture rejects removal'); END");
  const before=['oauthClient','oauthAccessToken','oauthRefreshToken','oauthConsent','verification'].map(t=>db.query('SELECT * FROM '+t).all());
  const preview=await(await request('?clientId=a&action=remove')).json();expect((await request('',{clientId:'a',action:'remove',confirm:true,confirmation:preview.confirmation})).status).toBe(409);
  expect(['oauthClient','oauthAccessToken','oauthRefreshToken','oauthConsent','verification'].map(t=>db.query('SELECT * FROM '+t).all())).toEqual(before);expect(db.query('SELECT * FROM plugin_client_management_audit').all()).toHaveLength(0);
 }finally{db.close();}
});
test('anonymous registrations stay advanced after explicit revoke, with no authorized connection',async()=>{
 const {db,request}=fixture();try{
  db.exec("UPDATE oauthClient SET userId=NULL WHERE clientId='a'");const preview=await(await request('?clientId=a&action=revoke')).json();expect((await request('',{clientId:'a',action:'revoke',confirm:true,confirmation:preview.confirmation})).status).toBe(200);
  const data=await(await request()).json();expect(data.clients.map((c:{clientId:string})=>c.clientId)).toContain('a');expect(data.connections.map((c:{clientId:string})=>c.clientId)).not.toContain('a');expect((await request('?clientId=a&action=remove')).status).toBe(200);
 }finally{db.close();}
});

test('active refresh grants remain visible after owner session expires, matching provider semantics',async()=>{
 const {db,request}=fixture();try{db.exec("DELETE FROM session; DELETE FROM oauthAccessToken");expect((await(await request()).json()).connections).toHaveLength(2);db.exec("UPDATE oauthRefreshToken SET expiresAt=0");expect((await(await request()).json()).connections).toHaveLength(0);}finally{db.close();}
});

test('shared database queue blocks local revoke until remote in-flight issuance settles',async()=>{
 const {db,request}=fixture();try{
  let entered!:()=>void,release!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;}),barrier=new Promise<void>(resolve=>{release=resolve;});
  const order:string[]=[];
  const remoteIssue=withOAuthMutation(db,async()=>{order.push('issuance-start');entered();await barrier;db.query('INSERT INTO oauthAccessToken VALUES(?,?,?,?,?,?,?,?,NULL)').run('late','a','owner','account','["mail.read"]',Date.now()+3600000,Date.now(),'s');order.push('issuance-end');});
  await started;
  const localRevoke=withOAuthMutation(db,async()=>{order.push('revoke');const preview=await(await request('?clientId=a&action=revoke')).json();return request('',{clientId:'a',action:'revoke',confirm:true,confirmation:preview.confirmation});});
  await Promise.resolve();expect(order).toEqual(['issuance-start']);release();await remoteIssue;expect((await localRevoke).status).toBe(200);expect(order).toEqual(['issuance-start','issuance-end','revoke']);expect(db.query("SELECT * FROM oauthAccessToken WHERE clientId='a'").all()).toHaveLength(0);
  await expect(withOAuthMutation(db,async()=>{throw Error('fixture failure');})).rejects.toThrow('fixture failure');expect(await withOAuthMutation(db,async()=>42)).toBe(42);
 }finally{db.close();}
});
