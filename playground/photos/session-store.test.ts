import {test,expect} from 'bun:test';
import {mkdtemp,chmod,stat,symlink,link,writeFile,readFile,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SessionStore, type SavedSession} from './session-store';
import {AppleAuthClient,AppleAuthError} from './apple-auth';
import {loginForProbe,cloudCommand} from './cloud-cli';
const saved=():SavedSession=>({version:1,dsid:'123',accountName:'test@example.test',clientId:'auth-12345678-1234-1234-1234-123456789012',cookies:{version:'tough-cookie@6.0.2',storeType:'MemoryCookieStore',rejectPublicSuffixes:true,cookies:[]},headers:{'x-apple-session-token':'synthetic-token'}});
const account={dsInfo:{dsid:'123',hsaVersion:2},hsaTrustedBrowser:true,webservices:{ckdatabasews:{url:'https://p01-ckdatabasews.icloud.com'}}};
async function temp(run:(path:string)=>Promise<void>){const p=await realpath(await mkdtemp(join(tmpdir(),'photos-session-test-')));try{await run(p);}finally{await rm(p,{recursive:true,force:true});}}
test('private store persists exact bounded state and atomic replacement without passwords',()=>temp(async p=>{const store=new SessionStore(join(p,'private'));expect(await store.load()).toBeUndefined();await store.save(saved());expect(await store.load()).toEqual(saved());expect((await stat(join(p,'private'))).mode&0o777).toBe(0o700);expect((await stat(join(p,'private/session.json'))).mode&0o777).toBe(0o600);const next=saved();next.headers['x-apple-session-token']='rotated';await store.save(next);expect((await store.load())?.headers['x-apple-session-token']).toBe('rotated');expect(await readFile(join(p,'private/session.json'),'utf8')).not.toContain('password');}));
test('store refuses permissive directories, symlink files, hardlinks and oversized JSON',()=>temp(async p=>{await chmod(p,0o755);await expect(new SessionStore(p).load()).rejects.toThrow('session_cache_unsafe');await chmod(p,0o700);const file=join(p,'session.json'),other=join(p,'other');await writeFile(other,JSON.stringify(saved()),{mode:0o600});await symlink(other,file);await expect(new SessionStore(p).load()).rejects.toThrow();await rm(file);await link(other,file);await expect(new SessionStore(p).load()).rejects.toThrow('session_cache_unsafe');await rm(file);await writeFile(file,'x'.repeat(300000),{mode:0o600});await expect(new SessionStore(p).load()).rejects.toThrow('session_cache_unsafe');}));
test('cache schema rejects foreign cookies and extra secrets',()=>temp(async p=>{for(const change of [(s:any)=>s.password='secret',(s:any)=>s.cookies.cookies=[{domain:'attacker.example',key:'a',value:'b'}],(s:any)=>s.headers['x-apple-i-rscd']='401']){const x=saved();change(x);await expect(new SessionStore(p).save(x)).rejects.toThrow('session_cache_invalid');}}));
test('resume validates once with scoped cookies and retains client identity',async()=>{const s=saved();s.cookies={...(s.cookies as any),cookies:[{key:'a',value:'b',domain:'setup.icloud.com',path:'/',hostOnly:true,secure:true}]};let count=0;const c=new AppleAuthClient({fetch:async(url,init)=>{count++;expect(String(url)).toEndWith('/validate');expect(init?.method).toBe('POST');expect(init?.body).toBe('null');expect(new Headers(init?.headers).get('cookie')).toBe('a=b');return Response.json(account);}});const result=await c.resume(s);expect(result.clientId).toBe(s.clientId);expect(count).toBe(1);expect(c.exportSession(s.accountName,result.dsid).headers).not.toHaveProperty('x-apple-i-rscd');});
test('expired validate tries token once but transport and server faults never trigger auth fallback',async()=>{let calls=0;const c=new AppleAuthClient({fetch:async()=>++calls===1?new Response(null,{status:421}):Response.json(account) as any});expect((await c.resume(saved())).dsid).toBe('123');expect(calls).toBe(2);for(const status of [500,403]){calls=0;await expect(new AppleAuthClient({fetch:async()=>{calls++;return new Response(null,{status});}}).resume(saved())).rejects.toThrow('account_login_rejected');expect(calls).toBe(1);}await expect(new AppleAuthClient({fetch:async()=>Response.json({...account,dsInfo:{dsid:'456'}}) as any}).resume(saved())).rejects.toThrow('session_account_mismatch');});
test('restart reuses saved session without credential prompts; saved before downstream read failure',()=>temp(async p=>{let prompts=0,auths=0;const fake=()=>({authenticate:async()=>{auths++;return{dsid:'123'};},exportSession:()=>saved()}) as unknown as AppleAuthClient;const context:any={stage:'input',authenticationVerified:false};await loginForProbe(p,context,async()=>{prompts++;return prompts===1?'test@example.test':'password-not-saved';},fake);expect(prompts).toBe(2);expect(auths).toBe(1);expect(context.authenticationVerified).toBe(true); // Caller could now fail a Photos read; cache already exists.
expect((await new SessionStore(p).load())?.dsid).toBe('123');await loginForProbe(p,{stage:'input',authenticationVerified:false},async()=>{throw Error('must not prompt');},()=>new AppleAuthClient({fetch:async()=>Response.json(account) as any}));expect(auths).toBe(1);
}));
test('expired cache prompts saved account password only; network error never prompts',()=>temp(async p=>{await new SessionStore(p).save(saved());let count=0,prompts=0;const fake=()=>({resume:async()=>{throw new AppleAuthError('session_expired');},authenticate:async(input:any)=>{expect(input.accountName).toBe(saved().accountName);return{dsid:'123'};},exportSession:()=>saved()}) as unknown as AppleAuthClient;await loginForProbe(p,{stage:'input',authenticationVerified:false},async()=>{prompts++;return'new-password';},()=>{count++;return fake();});expect(count).toBe(2);expect(prompts).toBe(1);await expect(loginForProbe(p,{stage:'input',authenticationVerified:false},async()=>{throw Error('unexpected prompt');},()=>new AppleAuthClient({fetch:async()=>{throw Error('network');}}))).rejects.toThrow('transport_error');}));
test('CLI persistence is explicit external directory',()=>{expect(cloudCommand(['--read','--session-dir','/private/tmp/test'])).toEqual({mode:'--read',showAlbums:false,sessionDirectory:'/private/tmp/test'});expect(()=>cloudCommand(['--read','--session-dir',import.meta.dir])).toThrow();expect(()=>cloudCommand(['--read','--session-dir','relative'])).toThrow();});
test('Apple parent-domain cookie round-trips but is never sent to iCloud setup',async()=>{const state=saved();(state.cookies as any).cookies=[{key:'apple-cookie',value:'synthetic',domain:'apple.com',path:'/',secure:true,hostOnly:false}];const c=new AppleAuthClient({fetch:async(url,init)=>{expect(new Headers(init?.headers).has('cookie')).toBe(false);return Response.json(account);}});const result=await c.resume(state);expect((c.exportSession(state.accountName,result.dsid).cookies as any).cookies[0].domain).toBe('apple.com');});

test('actual auth cookie serialization saves empty values and resumes with correct domain scope',()=>temp(async p=>{
  // Exercise the installed tough-cookie serializer, not hand-authored cookie JSON.
  const responses=[
    Response.json({protocol:'s2k',salt:'AQIDBA==',iteration:1000,b:'Ag==',c:'synthetic-challenge'}, {headers:{'set-cookie':'apple-empty=; Domain=.apple.com; Path=/; Secure; HttpOnly'}}),
    Response.json({}, {headers:{'x-apple-session-token':'synthetic-token'}}),
    Response.json(account, {headers:{'set-cookie':'icloud-empty=; Domain=.icloud.com; Path=/; Secure; HttpOnly'}}),
  ];
  const client=new AppleAuthClient({fetch:async()=>{const response=responses.shift();if(!response)throw Error('unexpected request');return response;}});
  const authenticated=await client.authenticate({accountName:'synthetic@example.invalid',password:'synthetic-password'});
  expect(responses).toHaveLength(0);
  const state=client.exportSession('synthetic@example.invalid',authenticated.dsid);
  const cookies=(state.cookies as any).cookies;
  expect(cookies).toHaveLength(2);
  for(const cookie of cookies) expect(cookie).not.toHaveProperty('value');
  const store=new SessionStore(p);
  await store.save(state);
  const loaded=await store.load();
  expect(loaded).toEqual(state);
  let calls=0;
  const resumed=new AppleAuthClient({fetch:async(url,init)=>{
    calls++;expect(String(url)).toEndWith('/validate');
    expect(new Headers(init?.headers).get('cookie')).toBe('icloud-empty=');
    return Response.json(account);
  }});
  expect((await resumed.resume(loaded!)).dsid).toBe(authenticated.dsid);
  expect(calls).toBe(1);
  await store.save(resumed.exportSession(state.accountName,authenticated.dsid));
  expect(await store.load()).toBeDefined();
}));

test('omitted cookie defaults do not admit invalid value types or foreign domains',()=>temp(async p=>{
  for(const value of [null,42,{},[],true]) {
    const state=saved();(state.cookies as any).cookies=[{domain:'icloud.com',key:'invalid',value}];
    await expect(new SessionStore(p).save(state)).rejects.toThrow('session_cache_invalid');
  }
  const state=saved();(state.cookies as any).cookies=[{domain:'icloud.com.attacker.invalid',key:'empty'}];
  await expect(new SessionStore(p).save(state)).rejects.toThrow('session_cache_invalid');
}));
