import { test,expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { makeSignature } from 'better-auth/crypto';
import { createAccountConnection,authorizationKey } from './connect.js';

const secret='connection-test-secret-that-is-long-enough';
async function signed(state='one',extras:Record<string,string>={}){
 const params=new URLSearchParams({client_id:'client',redirect_uri:'https://client.invalid/callback',response_type:'code',scope:'mail.read',state,code_challenge:'pkce-'+state,exp:String(Math.floor(Date.now()/1000)+600),ba_iat:String(Date.now()),...extras});
 params.set('sig',await makeSignature(new URLSearchParams([...params].sort(([a,b],[c,d])=>a<c?-1:a>c?1:b<d?-1:b>d?1:0)).toString(),secret));return params.toString();
}
test('connection selections bind immutable request and owner session, validate signatures and consume once',async()=>{
 const db=new Database(':memory:'),accounts=[{id:'first',user:'first@icloud.com',label:'First',credentialStored:true},{id:'second',user:'second@icloud.com',label:'Second',credentialStored:true}];
 const component=createAccountConnection({database:db,secret,origin:'https://icloud.invalid',store:{listAccounts:()=>accounts,legacyAccountId:()=>null,account:(_owner,id)=>{const value=accounts.find(a=>a.id===id);if(!value)throw Error('Absent');return value;},addAccount:()=>{throw Error('Unused');}},ownerSession:async headers=>{if(!headers.get('cookie'))throw Error('Login');return{user:{id:'owner'},session:{id:headers.get('cookie')!}};},validateCredential:async()=>{},continueAuthorization:async(_request,query,id)=>Response.json({url:'/icloud/consent?'+await signed(new URLSearchParams(query).get('state')!,{ba_pl:'session-one',prompt:'consent'}),accountId:id})});
 const request=(path:string,query:string,body?:object,cookie='session-one',origin='https://icloud.invalid')=>component.handle(new Request('https://icloud.invalid/icloud/connect/'+path+(body?'':'?oauth_query='+encodeURIComponent(query)),{method:body?'POST':'GET',headers:{cookie,origin,'content-type':'application/json'},body:body?JSON.stringify({oauth_query:query,...body}):undefined}));
 try{
  const first=await signed(),second=await signed('two');
  expect((await request('status',first,undefined,'')).status).toBe(401);
  expect((await request('select',first,{accountId:'first'},'session-one','https://evil.invalid')).status).toBe(403);
  expect((await request('select',first.replace('mail.read','mail.write'),{accountId:'first'})).status).toBe(400);
  expect((await request('select',await signed('expired',{exp:'1'}),{accountId:'first'})).status).toBe(400);
  expect((await request('select',first,{accountId:'absent'})).status).toBe(400);
  const decisions=await Promise.all([request('select',first,{accountId:'first'}),request('select',second,{accountId:'second'})]);expect(decisions.map(r=>r.status)).toEqual([200,200]);
  expect(component.selected(first,'owner','session-one')?.id).toBe('first');expect(component.selected(second,'owner','session-one')?.id).toBe('second');
  expect(component.selected(first,'other-owner','session-one')).toBeUndefined();expect(component.selected(first,'owner','session-two')).toBeUndefined();
  expect((await request('select',first,{accountId:'second'})).status).toBe(409);
  const consentQuery=new URL((await decisions[0]!.json()).url,'https://icloud.invalid').search.slice(1);
  expect(authorizationKey(first)).not.toBe(authorizationKey(consentQuery));
  expect((await(await request('status',consentQuery)).json()).selectedAccount.id).toBe('first');
  expect((await request('select',consentQuery,{accountId:'second'})).status).toBe(403);
  expect((await request('status',consentQuery,undefined,'session-two')).status).toBe(403);
  component.consume(consentQuery,'owner','session-one');expect(component.selected(consentQuery,'owner','session-one')).toBeUndefined();
  expect((await request('status',consentQuery)).status).toBe(403);
  const cancelled=await signed('cancelled');component.cancel(cancelled,'owner','session-one');expect((await request('select',cancelled,{accountId:'first'})).status).toBe(409);
 }finally{db.close();}
});

test('add account validates credentials transiently, refuses duplicates and bounds attempts',async()=>{
 const db=new Database(':memory:');let validated=0;let stored:string|undefined;
 const accounts:Array<{id:string;user:string;label:string;credentialStored:boolean}>=[];
 const component=createAccountConnection({database:db,secret,origin:'https://icloud.invalid',store:{listAccounts:()=>accounts,legacyAccountId:()=>null,account:()=>{throw Error('Unused');},addAccount:(_owner,input)=>{stored=Buffer.from(input.credential).toString();const account={id:'added',user:input.user,label:input.label??input.user,credentialStored:true};accounts.push(account);return account;}},ownerSession:async()=>({user:{id:'owner'},session:{id:'session'}}),validateCredential:async credential=>{validated++;if(credential.user.startsWith('failed'))throw Error('secret error detail never exposed');},continueAuthorization:async()=>Response.json({url:'/icloud/consent?'+await signed('valid',{ba_pl:'session',prompt:'consent'})})});
 const add=async(state:string,user='fresh@icloud.com')=>component.handle(new Request('https://icloud.invalid/icloud/connect/add',{method:'POST',headers:{origin:'https://icloud.invalid','content-type':'application/json'},body:JSON.stringify({oauth_query:await signed(state),user,appPassword:'app-password'})}));
 try{
  expect((await add('valid')).status).toBe(200);expect(stored).toBe(JSON.stringify({user:'fresh@icloud.com',appPassword:'app-password'}));
  expect((await add('duplicate','FRESH@icloud.com')).status).toBe(409);expect(validated).toBe(1);
  for(let i=0;i<9;i++){const response=await add('fail-'+i,'failed@icloud.com');expect(response.status).toBe(422);expect(await response.text()).not.toContain('secret error');}
  expect((await add('limited','failed@icloud.com')).status).toBe(429);expect(validated).toBe(10);
 }finally{db.close();}
});

test('pending credential validation cannot overwrite a selection already displayed for consent',async()=>{
 const db=new Database(':memory:'),accounts=[{id:'first',user:'first@icloud.com',label:'First',credentialStored:true}];
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve);
 let entered!:()=>void;const started=new Promise<void>(resolve=>entered=resolve);
 const component=createAccountConnection({database:db,secret,origin:'https://icloud.invalid',store:{listAccounts:()=>accounts,legacyAccountId:()=>null,account:(_owner,id)=>{const item=accounts.find(a=>a.id===id);if(!item)throw Error('Unknown');return item;},addAccount:(_owner,input)=>{const account={id:'second',user:input.user,label:'Second',credentialStored:true};accounts.push(account);return account;}},ownerSession:async()=>({user:{id:'owner'},session:{id:'session'}}),validateCredential:async()=>{entered();await pending;},continueAuthorization:async()=>Response.json({url:'/icloud/consent?'+await signed('race',{ba_pl:'session',prompt:'consent'})})});
 const query=await signed('race');
 const request=(path:string,body:object)=>component.handle(new Request('https://icloud.invalid/icloud/connect/'+path,{method:'POST',headers:{origin:'https://icloud.invalid','content-type':'application/json'},body:JSON.stringify({oauth_query:query,...body})}));
 try{
  const adding=request('add',{user:'second@icloud.com',appPassword:'secret'});await started;
  const selection=await request('select',{accountId:'first'});expect(selection.status).toBe(200);
  const consentQuery=new URL((await selection.json()).url,'https://icloud.invalid').search.slice(1);
  release();expect((await adding).status).toBe(409);
  expect(component.selected(consentQuery,'owner','session')?.id).toBe('first');
  expect(component.consume(consentQuery,'owner','session')).toBe(true);expect(component.consume(consentQuery,'owner','session')).toBe(false);
 }finally{release();db.close();}
});

test('failed continuation retains added account and requires a fresh authorization',async()=>{
 const db=new Database(':memory:'),accounts:Array<{id:string;user:string;label:string;credentialStored:boolean}>=[];let fail=true;
 const component=createAccountConnection({database:db,secret,origin:'https://icloud.invalid',store:{listAccounts:()=>accounts,legacyAccountId:()=>null,account:()=>accounts[0]!,addAccount:(_owner,input)=>{const account={id:'saved',user:input.user,label:'Saved',credentialStored:true};accounts.push(account);return account;}},ownerSession:async()=>({user:{id:'owner'},session:{id:'session'}}),validateCredential:async()=>{},continueAuthorization:async()=>{if(fail)throw Error('Unavailable');return Response.json({url:'/icloud/consent?'+await signed('fresh',{ba_pl:'session',prompt:'consent'})});}});
 const request=async(path:string,state:string,body:object)=>component.handle(new Request('https://icloud.invalid/icloud/connect/'+path,{method:'POST',headers:{origin:'https://icloud.invalid','content-type':'application/json'},body:JSON.stringify({oauth_query:await signed(state),...body})}));
 try{const failed=await request('add','old',{user:'saved@icloud.com',appPassword:'secret'});expect((await failed.json()).error).toBe('CONNECT_RESTART_REQUIRED');expect(accounts.length).toBe(1);fail=false;expect((await request('select','fresh',{accountId:'saved'})).status).toBe(200);}finally{db.close();}
});
