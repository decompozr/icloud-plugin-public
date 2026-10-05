import {expect, test} from 'bun:test';
import {AppleAuthClient, AppleHttpSession} from './apple-auth.ts';

const challenge = {protocol:'s2k', salt:'AQIDBA==', iteration:1000, b:'Ag==', c:'synthetic-challenge'};
const services = {ckdatabasews:{url:'https://p01-ckdatabasews.icloud.com'}};
const credentials = {accountName:'synthetic@example.invalid', password:'synthetic-private-password'};
const json = (value: unknown, status=200, headers: HeadersInit = {}) => new Response(JSON.stringify(value), {status, headers});
type Seen = {url:string; init:RequestInit; headers:Headers; body:any};
function script(responses: Response[]) {
  const seen: Seen[] = [];
  const mock = (async (input: string | URL, init: RequestInit = {}) => {
    seen.push({url:String(input), init, headers:new Headers(init.headers), body:init.body ? JSON.parse(String(init.body)) : undefined});
    const response = responses.shift();
    if (!response) throw new Error('Unexpected fixture request');
    return response;
  }) as typeof fetch;
  return {seen, mock};
}
const complete = (status=200) => json({}, status, {'x-apple-session-token':'synthetic-token', 'x-apple-id-account-country':'CA'});
const account = (trusted=true) => json({dsInfo:{dsid:'123456',hsaVersion:2}, hsaTrustedBrowser:trusted, hsaChallengeRequired:!trusted, webservices:services});
test('Shared Streams allows exact first-party hosts and refuses suffix lookalikes',async()=>{
 let calls=0;
 const client=new AppleHttpSession({fetch:async()=>{calls++;return Response.json({});}});
 await client.request('https://p110-sharedstreams.icloud.com/123/sharedstreams/webgetalbumslist',{method:'POST',body:'{}'});
 expect(calls).toBe(1);
 await expect(client.request('https://p110-sharedstreams.icloud.com.attacker.invalid/')).rejects.toMatchObject({code:'untrusted_endpoint'});
 await expect(client.request('https://other.icloud.com/')).rejects.toMatchObject({code:'untrusted_endpoint'});
 expect(calls).toBe(1);
});

test('fresh SRP auth and service discovery, no clear password transmission', async () => {
  const {seen,mock} = script([json(challenge,200,{'scnt':'first-scnt', 'x-apple-id-session-id':'first-session'}),complete(),account()]);
  const client = new AppleAuthClient({fetch:mock});
  const result = await client.authenticate(credentials);
  expect(result.dsid).toBe('123456');
  expect(result.webservices).toEqual(services);
  expect(result.clientId).toBe(client.clientId);
  expect(seen.map(x => new URL(x.url).pathname)).toEqual(['/appleauth/auth/signin/init','/appleauth/auth/signin/complete','/setup/ws/1/accountLogin']);
  expect(seen[1]!.headers.get('scnt')).toBe('first-scnt');
  expect(seen[1]!.headers.get('x-apple-id-session-id')).toBe('first-session');
  expect(Buffer.from(seen[1]!.body.m1,'base64').length).toBe(32);
  expect(Buffer.from(seen[1]!.body.m2,'base64').length).toBe(32);
  expect(seen[2]!.body.dsWebAuthToken).toBe('synthetic-token');
  expect(seen[2]!.headers.has('x-apple-id-session-id')).toBe(false);
  expect(JSON.stringify(seen)).not.toContain(credentials.password);
  await expect(client.authenticate(credentials)).rejects.toMatchObject({code:'client_already_used'});
});

test('409 performs accountLogin, one push before prompting, code verification, trust and accountLogin with updated token', async () => {
  const {seen,mock} = script([json(challenge,200,{scnt:"first-scnt","x-apple-id-session-id":"first-session"}),complete(409),account(false),new Response(null,{status:204,headers:{scnt:"push-scnt","x-apple-id-session-id":"push-session"}}),new Response(null,{status:204}),
    json({},200,{'x-apple-twosv-trust-token':'new-trust', 'x-apple-session-token':'new-token'}),account()]);
  let prompts=0;
  const result = await new AppleAuthClient({fetch:mock}).authenticate({...credentials,getCode:async()=>{expect(seen).toHaveLength(4);prompts++;return '123456';}});
  expect(prompts).toBe(1);
  expect(result.dsid).toBe('123456');
  expect(new URL(seen[3]!.url).pathname).toEndWith('/verify/trusteddevice/securitycode');
  expect(seen[3]!.init.method).toBe("PUT");
  expect(seen[3]!.init.body).toBeUndefined();
  expect(seen[3]!.headers.get("accept")).toBe("application/json");
  expect(seen[3]!.headers.get("scnt")).toBe("first-scnt");
  expect(seen[3]!.headers.get("x-apple-id-session-id")).toBe("first-session");
  expect(seen[4]!.headers.get("scnt")).toBe("push-scnt");
  expect(seen[4]!.headers.get("x-apple-id-session-id")).toBe("push-session");
  expect(seen[4]!.init.method).toBe("POST");
  expect(seen[4]!.headers.get("accept")).toBe("application/json");
  expect(seen[4]!.body).toEqual({securityCode:{code:'123456'}});
  expect(seen[5]!.init.method).toBe('GET');
  expect(seen[6]!.body.dsWebAuthToken).toBe('new-token');
  expect(seen[6]!.body.trustToken).toBe('new-trust');
});

test('2FA required, rejected code and still-untrusted state never yield authenticated session', async () => {
  let fixture=script([json(challenge),complete(409),account(false)]);
  await expect(new AppleAuthClient({fetch:fixture.mock}).authenticate(credentials)).rejects.toMatchObject({code:'two_factor_required'});
  fixture=script([json(challenge),complete(409),account(false),json({}),json({secret:'sensitive-error'},400)]);
  await expect(new AppleAuthClient({fetch:fixture.mock}).authenticate({...credentials,getCode:async()=> '123456'})).rejects.toMatchObject({code:'authentication_rejected',status:400});
  fixture=script([json(challenge),complete(409),account(false),json({}),json({}),json({}),account(false)]);
  await expect(new AppleAuthClient({fetch:fixture.mock}).authenticate({...credentials,getCode:async()=> '123456'})).rejects.toMatchObject({code:'session_not_trusted'});
});

test('expired, repair and malformed responses produce redacted fixed errors', async () => {
  for (const [responses,code] of [
    [[json({sensitive:'secret-value'},401)],'authentication_rejected'],
    [[json({hasError:true,service_errors:[{message:'private-error'}]})],'authentication_rejected'],
    [[json(challenge),complete(412)],'account_repair_required'],
    [[json(challenge),json({})],'missing_session_token'],
    [[json({...challenge,b:'AA=='})],'invalid_srp_challenge'],
    [[json(challenge),complete(),json({domainToUse:'iCloud.com.cn'})],'alternate_region_required'],
    [[new Response('private non-JSON response')],'invalid_response'],
  ] as const) {
    const fixture=script([...responses]);
    await expect(new AppleAuthClient({fetch:fixture.mock}).authenticate(credentials)).rejects.toMatchObject({code});
  }
});

test('push rejection is redacted, never retried and never prompts for a code', async () => {
  for (const response of [json({secret:'private-provider-error'},429), json({serviceErrors:[{message:'private-provider-error'}]})]) {
    const {seen,mock}=script([json(challenge),complete(409),account(false),response]);
    let prompts=0;
    const error=await new AppleAuthClient({fetch:mock}).authenticate({...credentials,getCode:async()=>{prompts++;return '123456';}}).catch(error=>error);
    expect(error.code).toBe('two_factor_push_failed');
    expect(error.message).not.toContain('private-provider-error');
    expect(prompts).toBe(0);
    expect(seen).toHaveLength(4);
    expect(seen[3]!.init.method).toBe('PUT');
  }
});

test('cookie domain, path, deletion and secure scope; auth headers never leak to Photos', async () => {
  const cookieHeaders=new Headers();
  cookieHeaders.append('set-cookie','host=only; Path=/setup; Secure');
  cookieHeaders.append('set-cookie','shared=yes; Domain=.icloud.com; Path=/; Secure');
  cookieHeaders.append('set-cookie','bad=no; Domain=.com; Path=/; Secure');
  const {seen,mock}=script([json({},200,cookieHeaders),json({}),json({},200,{'set-cookie':'shared=; Domain=.icloud.com; Path=/; Max-Age=0'}),json({}),json({})]);
  const session=new AppleHttpSession({fetch:mock});
  await session.request('https://setup.icloud.com/setup/ws/1/accountLogin');
  await session.request('https://p01-ckdatabasews.icloud.com/database');
  await session.request('https://setup.icloud.com/setup/ws/1/validate');
  await session.request('https://setup.icloud.com/other');
  await session.request('https://idmsa.apple.com/appleauth/auth',{headers:{cookie:'injected=secret'}});
  expect(seen[1]!.headers.get('cookie')).toBe('shared=yes');
  expect(seen[2]!.headers.get('cookie')).toBe('host=only; shared=yes');
  expect(seen[3]!.headers.get('cookie')).toBeNull();
  expect(seen[4]!.headers.get('cookie')).toBeNull();
  expect(seen[1]!.headers.get('origin')).toBe('https://www.icloud.com');
  expect(seen.every(x=>x.init.redirect==='manual')).toBe(true);
  expect(JSON.stringify(session)).toBe('{}');
});

test('untrusted hosts and redirects refused without forwarding credentials', async () => {
  const {seen,mock}=script([new Response(null,{status:302,headers:{location:'https://evil.invalid/?secret=private'}})]);
  const session=new AppleHttpSession({fetch:mock});
  for (const url of ['http://setup.icloud.com','https://setup.icloud.com.evil.invalid','https://user:secret@setup.icloud.com','https://setup.icloud.com:8443','https://icloud.com']) {
    await expect(session.request(url)).rejects.toMatchObject({code:'untrusted_endpoint'});
  }
  expect(seen).toHaveLength(0);
  await expect(session.request('https://setup.icloud.com')).rejects.toMatchObject({code:'redirect_refused',status:302});
  expect(seen).toHaveLength(1);
});

test('transport error, streamed size and whole-response deadline are bounded and redacted', async () => {
  const leak = new AppleHttpSession({fetch:(async()=>{throw new Error('secret password url');}) as typeof fetch});
  await expect(leak.request('https://setup.icloud.com')).rejects.toThrow('Apple Photos request failed: transport_error');
  const huge=new AppleHttpSession({fetch:(async()=>new Response(new Uint8Array(8*1024*1024+1))) as typeof fetch});
  await expect(huge.request('https://setup.icloud.com')).rejects.toMatchObject({code:'response_too_large'});
  const stall=new AppleHttpSession({fetch:(async()=>new Response(new ReadableStream({start(){}}))) as typeof fetch,timeoutMs:10});
  await expect(stall.request('https://setup.icloud.com')).rejects.toMatchObject({code:'timeout'});
});

test('post-code failures retain exact auth stage and numeric status without private provider body', async()=>{
  for (const failureAt of ['verify-2fa','trust-session','account-login-after-2fa'] as const) {
    const responses=[json(challenge),complete(409),account(false),new Response(null,{status:204})];
    if(failureAt!=='verify-2fa') responses.push(new Response(null,{status:204,headers:{scnt:'verified-scnt','x-apple-id-session-id':'verified-session'}}));
    if(failureAt==='account-login-after-2fa') responses.push(json({},200,{'x-apple-session-token':'trusted-token'}));
    responses.push(json({message:'private-data-never-output'},403));
    const {seen,mock}=script(responses);
    let stage='';
    const error=await new AppleAuthClient({fetch:mock}).authenticate({...credentials,getCode:async()=> '123456',onStage:value=>{stage=value;}}).catch(error=>error);
    expect(stage).toBe(failureAt);
    expect(error.status).toBe(403);
    expect(error.message).not.toContain('private-data-never-output');
    if(failureAt!=='verify-2fa') {
      expect(seen[5]!.headers.get('scnt')).toBe('verified-scnt');
      expect(seen[5]!.headers.get('x-apple-id-session-id')).toBe('verified-session');
    }
    if(failureAt==='account-login-after-2fa') expect(seen[6]!.body.dsWebAuthToken).toBe('trusted-token');
  }
});
