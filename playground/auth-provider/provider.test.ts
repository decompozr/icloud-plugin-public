import { test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { jwt } from 'better-auth/plugins';
import { oauthProvider } from '@better-auth/oauth-provider';
import { passkey } from '@better-auth/passkey';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('candidate Bun SQLite migrations and HTTP OAuth discovery/registration/login gate', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'icloud-auth-candidate-'));
  const db = new Database(join(dir, 'auth.sqlite'));
  let handler: (r: Request) => Promise<Response> = async () => new Response('starting', {status:503});
  const server = Bun.serve({hostname:'127.0.0.1',port:0,fetch:r=>handler(r)});
  const base = `http://127.0.0.1:${server.port}`;
  try {
    const options = {
      database:db, baseURL:base, secret:'fixture-only-not-a-production-secret-0123456789',
      disabledPaths:['/token'],
      plugins:[jwt(),passkey({rpID:'localhost',rpName:'Fixture',origin:base}),oauthProvider({loginPage:'/sign-in',consentPage:'/consent',allowDynamicClientRegistration:true,allowUnauthenticatedClientRegistration:true,scopes:['openid','offline_access','mail.read']})],
    };
    const migration = await getMigrations(options); await migration.runMigrations();
    const tables = db.query("SELECT name FROM sqlite_master WHERE type='table'").all().map((row: any) => row.name);
    expect(tables).toContain('passkey');
    expect(tables).toContain('oauthClient');
    expect(tables).toContain('oauthRefreshToken');
    const auth = betterAuth(options); handler = auth.handler;
    const discovery = await fetch(`${base}/.well-known/oauth-authorization-server/api/auth`);
    expect(discovery.status).toBe(200);
    const metadata = await discovery.json() as Record<string, any>;
    expect(metadata.code_challenge_methods_supported).toContain('S256');
    expect(metadata.grant_types_supported).toContain('refresh_token');
    expect(metadata.scopes_supported).toContain('mail.read');
    expect(metadata.registration_endpoint).toBeString();
    const registration = await fetch(metadata.registration_endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'Fixture public client',application_type:'native',redirect_uris:[`${base}/callback`],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],scope:'mail.read offline_access'})});
    expect(registration.status).toBe(201);
    const client = await registration.json() as Record<string, any>;
    expect(client.client_id).toBeString();
    expect(client.client_secret).toBeUndefined();
    const authorize = new URL(metadata.authorization_endpoint);
    authorize.search = new URLSearchParams({client_id:client.client_id,redirect_uri:`${base}/callback`,response_type:'code',scope:'mail.read',state:'fixture-state',code_challenge:'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',code_challenge_method:'S256'}).toString();
    const gated = await fetch(authorize,{redirect:'manual'});
    expect(gated.status).toBe(302);
    expect(new URL(gated.headers.get('location')!,base).pathname).toBe('/sign-in');
    const invalid = await fetch(metadata.token_endpoint,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:client.client_id,code:'invented',redirect_uri:`${base}/callback`,code_verifier:'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wWFOEjXk'})});
    expect(invalid.status).toBe(400);
    expect((await invalid.json() as any).error).toBe('invalid_grant');
  } finally { await server.stop(true); db.close(); await rm(dir,{recursive:true,force:true}); }
});
