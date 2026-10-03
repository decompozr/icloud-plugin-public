import { test, expect } from 'bun:test';
import { createHash, randomBytes } from 'node:crypto';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
// In-memory protocol model only. Not a deployable OAuth server.
const digest = (s: string) => createHash('sha256').update(s).digest('base64url');
const client = 'fixture-client', redirect = 'http://localhost:9876/callback', resource = 'https://mail.example.test/mcp', issuer = 'https://mail.example.test';
const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const request = { client, redirect, resource, challenge: digest(verifier), method: 'S256', scope: 'mail.read', state: 'fixture-state' };
type Request = typeof request;
class GrantModel {
  codes = new Map<string, { request: Request; expires: number }>();
  authorize(r: Request, now = 0) {
    if (r.client !== client || r.redirect !== redirect || r.resource !== resource || r.method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(r.challenge) || r.scope !== 'mail.read') throw Error('invalid request');
    const code = randomBytes(32).toString('base64url'); this.codes.set(code, { request: r, expires: now + 60 }); return { code, state: r.state };
  }
  redeem(code: string, input = { client, redirect, resource, verifier }, now = 0) {
    const grant = this.codes.get(code);
    if (!grant || now >= grant.expires || input.client !== grant.request.client || input.redirect !== grant.request.redirect || input.resource !== grant.request.resource || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.verifier) || digest(input.verifier) !== grant.request.challenge) throw Error('invalid grant');
    this.codes.delete(code); return { scope: grant.request.scope, audience: grant.request.resource };
  }
}
test('L8 RFC7636 S256 vector', () => expect(digest(verifier)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'));
test('L8 valid grant redeems once', () => { const g = new GrantModel(); const {code} = g.authorize(request); expect(g.redeem(code).scope).toBe('mail.read'); expect(() => g.redeem(code)).toThrow('invalid grant'); });
for (const field of ['client','redirect','resource','method','scope','challenge'] as const) test(`L8 authorization rejects wrong ${field}`, () => expect(() => new GrantModel().authorize({...request, [field]: request[field]+'-other'})).toThrow());
for (const field of ['client','redirect','resource','verifier'] as const) test(`L8 redemption rejects wrong ${field}`, () => { const g = new GrantModel(); const {code} = g.authorize(request); expect(() => g.redeem(code, {...{client,redirect,resource,verifier}, [field]: 'wrong'})).toThrow(); });
test('L8 expires authorization code at deadline', () => { const g = new GrantModel(); const {code} = g.authorize(request); expect(() => g.redeem(code, undefined, 60)).toThrow(); });
test('L8 simulated client rejects state mismatch', () => { const acceptCallback = (returned: string) => { if (returned !== request.state) throw Error('state mismatch'); }; const response = new GrantModel().authorize(request); expect(() => acceptCallback(response.state)).not.toThrow(); expect(() => acceptCallback('other')).toThrow(); });
const keys = await generateKeyPair('ES256');
const revoked = new Set<string>();
const token = (claims = {}, key = keys.privateKey) => new SignJWT({scope: 'mail.read', ...claims}).setProtectedHeader({alg:'ES256',typ:'at+jwt'}).setIssuer(issuer).setAudience(resource).setSubject('fixture-owner').setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime('5m').sign(key);
async function access(value: string | undefined, scope = 'mail.read', options = {}) {
  if (!value) throw Error('missing token');
  const {payload} = await jwtVerify(value, keys.publicKey, {algorithms:['ES256'],typ:'at+jwt',issuer,audience:resource, requiredClaims:['exp','sub','jti'], ...options});
  if (revoked.has(payload.jti!)) throw Error('revoked');
  if (typeof payload.scope !== 'string' || !payload.scope.split(' ').includes(scope)) throw Error('insufficient scope');
  return payload;
}
test('L8 jose validates signature audience issuer and permitted scope', async () => expect((await access(await token())).sub).toBe('fixture-owner'));
test('L8 rejects missing token', async () => { await expect(access(undefined)).rejects.toThrow('missing token'); });
test('L8 rejects wrong audience', async () => { await expect(access(await token(), 'mail.read', {audience:'other'})).rejects.toThrow(); });
test('L8 rejects wrong issuer', async () => { await expect(access(await token(), 'mail.read', {issuer:'other'})).rejects.toThrow(); });
test('L8 rejects wrong signing key', async () => { const other = await generateKeyPair('ES256'); await expect(access(await token({},other.privateKey))).rejects.toThrow(); });
test('L8 rejects expiry with deterministic future clock', async () => { await expect(access(await token(), 'mail.read', {currentDate:new Date(Date.now()+600_000)})).rejects.toThrow(); });
test('L8 rejects insufficient scope', async () => { await expect(access(await token(), 'mail.write')).rejects.toThrow('insufficient scope'); });
test('L8 rejects revoked identifier', async () => { const t = await token(); revoked.add((await access(t)).jti!); await expect(access(t)).rejects.toThrow('revoked'); });

test('L8 real loopback HTTP fake-client authorization/token/resource roundtrip and denials', async () => {
  const grants = new GrantModel();
  const server = Bun.serve({
    hostname: '127.0.0.1', port: 0,
    async fetch(req) {
      const url = new URL(req.url);
      try {
        if (url.pathname === '/authorize' && req.method === 'GET') {
          const q = url.searchParams;
          const result = grants.authorize({ client: q.get('client_id')!, redirect: q.get('redirect_uri')!, resource: q.get('resource')!, challenge: q.get('code_challenge')!, method: q.get('code_challenge_method')!, scope: q.get('scope')!, state: q.get('state')! });
          const callback = new URL(redirect);
          callback.searchParams.set('code', result.code);
          callback.searchParams.set('state', result.state);
          return Response.redirect(callback.toString(), 302);
        }
        if (url.pathname === '/token' && req.method === 'POST') {
          const p = new URLSearchParams(await req.text());
          if (p.get('grant_type') !== 'authorization_code') throw Error('unsupported grant');
          const grant = grants.redeem(p.get('code')!, {client:p.get('client_id')!,redirect:p.get('redirect_uri')!,resource:p.get('resource')!,verifier:p.get('code_verifier')!});
          return Response.json({access_token:await token({scope:grant.scope}),token_type:'Bearer'});
        }
        if (url.pathname === '/resource') {
          try {
            const authorization = req.headers.get('authorization');
            await access(authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined);
            return Response.json({ fixture: 'authorized mailbox tool result; no real mail' });
          } catch { return new Response('unauthorized', {status:401}); }
        }
        return new Response('not found', {status:404});
      } catch { return Response.json({error:'invalid_request_or_grant'}, {status:400}); }
    },
  });
  const base = `http://127.0.0.1:${server.port}`;
  const authorize = (callback = redirect) => fetch(`${base}/authorize?${new URLSearchParams({client_id:client,redirect_uri:callback,resource,code_challenge:digest(verifier),code_challenge_method:'S256',scope:'mail.read',state:request.state})}`, {redirect:'manual'});
  const exchange = (code: string, proof = verifier) => fetch(`${base}/token`, {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,client_id:client,redirect_uri:redirect,resource,code_verifier:proof})});
  try {
    expect((await authorize(`${redirect}/wrong`)).status).toBe(400);
    const response = await authorize();
    expect(response.status).toBe(302);
    const callback = new URL(response.headers.get('location')!);
    expect(`${callback.origin}${callback.pathname}`).toBe(redirect);
    // Fake client processes the actual HTTP Location header; no browser launched.
    expect(callback.searchParams.get('state')).toBe(request.state);
    const code = callback.searchParams.get('code')!;
    expect((await exchange(code, 'wrong')).status).toBe(400);
    const exchanged = await exchange(code);
    expect(exchanged.status).toBe(200);
    const body = await exchanged.json() as {access_token:string};
    expect((await exchange(code)).status).toBe(400);
    expect((await fetch(`${base}/resource`)).status).toBe(401);
    expect((await fetch(`${base}/resource`, {headers:{authorization:'Bearer invalid'}})).status).toBe(401);
    const allowed = await fetch(`${base}/resource`, {headers:{authorization:`Bearer ${body.access_token}`}});
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toEqual({fixture:'authorized mailbox tool result; no real mail'});
  } finally { await server.stop(true); }
});
