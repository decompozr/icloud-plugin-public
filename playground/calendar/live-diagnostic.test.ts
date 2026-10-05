import {expect, test} from 'bun:test';
import {Database} from 'bun:sqlite';
import {createCipheriv, createHmac, randomBytes} from 'node:crypto';
import {chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseDiagnosticArgs, readOwnerCredential, runDiagnostic, validateDiagnostic, type DiagnosticOptions} from './live-diagnostic';

const options: DiagnosticOptions = {configPath: '/unused/synthetic/config.toml', confirmOwnerDiagnostic: true,
  start: '2026-10-03T00:00:00Z', end: '2026-10-04T00:00:00Z', origins: ['https://caldav.icloud.com']};

test('diagnostic explicit scope gates run before credential provider or network', async () => {
  let loads = 0, factories = 0;
  const factory = () => { factories++; return {discover: async () => [], readWindow: async () => ({resourceCount: 0, complete: true})}; };
  const provider = () => { loads++; return {user: 'owner@example.invalid', appPassword: 'dummy'}; };
  for (const invalid of [{...options, confirmOwnerDiagnostic: false}, {...options, origins: ['https://evil.invalid']},
    {...options, origins: ['https://caldav.icloud.com.evil.invalid']}, {...options, origins: ['https://caldav.icloud.com:443']},
    {...options, end: '2027-01-01T00:00:00Z'}]) await expect(runDiagnostic(invalid, factory, provider)).rejects.toThrow();
  expect(loads).toBe(0); expect(factories).toBe(0);
  expect(() => parseDiagnosticArgs(['--config', '/unused'])).toThrow();
  expect(() => validateDiagnostic({...options, origins: ['https://p123-caldav.icloud.com']})).not.toThrow();
});

test('diagnostic outputs counts only and sanitizes provider details, with finite reads and no writes', async () => {
  const credential = {user: 'owner-private@example.invalid', appPassword: 'private-password'};
  const calls: string[] = [];
  const result = await runDiagnostic(options, () => ({
    async discover() { calls.push('discover'); return [{href: '/private-calendar'}]; },
    async readWindow(href, start, end) { calls.push(`${href}:${start}:${end}`); return {resourceCount: 2, complete: true}; },
  }), () => credential);
  expect(result).toEqual({mode: 'owner-read-only-diagnostic', calendarCount: 1, resourceCount: 2, complete: true});
  expect(JSON.stringify(result)).not.toContain('private'); expect(calls).toHaveLength(2);
  expect(credential).toEqual({user: '', appPassword: ''});
  await expect(runDiagnostic(options, () => ({discover: async () => { throw Error('private token/address'); },
    readWindow: async () => ({resourceCount: 0, complete: true})}), () => ({user: 'dummy', appPassword: 'dummy'}))).rejects.toThrow('CALDAV_READ_FAILED');
  await expect(runDiagnostic(options, () => ({discover: async () => [{href: '/dummy'}],
    readWindow: async () => ({resourceCount: 1, complete: false})}), () => ({user: 'dummy', appPassword: 'dummy'}))).rejects.toThrow('INCOMPLETE_READ');
});

function custodyFixture() {
  const root = mkdtempSync(join(tmpdir(), 'calendar-diagnostic-test-')); chmodSync(root, 0o700);
  const state = join(root, 'state'); mkdirSync(state, {mode: 0o700});
  const key = randomBytes(32), id = crypto.randomUUID(), owner = 'synthetic-owner';
  const keyPath = join(root, 'master.key'), markerPath = join(root, 'marker');
  writeFileSync(keyPath, key, {mode: 0o600});
  const marker = {id, phase: 'enrolled', owner, mac: createHmac('sha256', key)
    .update(JSON.stringify({version: 1, id, phase: 'enrolled', owner})).digest('hex')};
  writeFileSync(markerPath, JSON.stringify(marker), {mode: 0o600});
  const cipher = createCipheriv('aes-256-gcm', key, Buffer.alloc(12, 1));
  cipher.setAAD(Buffer.from(`credential:v1:${owner}:1`));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({user: 'dummy@example.invalid', appPassword: 'dummy-password'})), cipher.final()]);
  const envelope = JSON.stringify({iv: Buffer.alloc(12, 1).toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: encrypted.toString('base64')});
  const database = join(state, 'owner.sqlite');
  const db = new Database(database);
  db.exec('CREATE TABLE owner_state(singleton INTEGER PRIMARY KEY,install TEXT,owner TEXT,proof TEXT,secret TEXT,version INTEGER)');
  db.query('INSERT INTO owner_state VALUES(1,?,?,NULL,?,1)').run(id, owner, envelope); db.close(); chmodSync(database, 0o600);
  const configPath = join(root, 'config.toml');
  writeFileSync(configPath, 'state_directory="./state"\nmaster_key_file="./master.key"\ninstallation_marker="./marker"\n', {mode: 0o600});
  key.fill(0);
  return {root, state, database, markerPath, keyPath, configPath};
}

test('synthetic read-only loader preserves custody/state bytes and rejects tampered marker and modes', () => {
  const fixture = custodyFixture();
  try {
    const before = [fixture.database, fixture.markerPath, fixture.keyPath, fixture.configPath].map(path => readFileSync(path));
    expect(readOwnerCredential({...options, configPath: fixture.configPath})).toEqual({user: 'dummy@example.invalid', appPassword: 'dummy-password'});
    expect(readdirSync(fixture.state)).toEqual(['owner.sqlite']);
    for (const [index, path] of [fixture.database, fixture.markerPath, fixture.keyPath, fixture.configPath].entries()) expect(readFileSync(path)).toEqual(before[index]);
    const marker = JSON.parse(readFileSync(fixture.markerPath, 'utf8')); marker.owner = 'wrong-owner';
    writeFileSync(fixture.markerPath, JSON.stringify(marker));
    expect(() => readOwnerCredential({...options, configPath: fixture.configPath})).toThrow('CUSTODY_MARKER_MISMATCH');
    writeFileSync(fixture.markerPath, before[1]!); chmodSync(fixture.keyPath, 0o644);
    expect(() => readOwnerCredential({...options, configPath: fixture.configPath})).toThrow('OWNER_ONLY_CUSTODY_REQUIRED');
  } finally { rmSync(fixture.root, {recursive: true, force: true}); }
});

function migrateFixture(fixture: ReturnType<typeof custodyFixture>, decryptedUser = 'dummy@example.invalid') {
  const marker = JSON.parse(readFileSync(fixture.markerPath, 'utf8')), key = readFileSync(fixture.keyPath), id = crypto.randomUUID();
  // Keep the actual IV with the synthetic envelope.
  const iv = randomBytes(12), encoder = createCipheriv('aes-256-gcm', key, iv);
  encoder.setAAD(Buffer.from(`credential:v2:${marker.owner}:${id}:1`));
  const data = Buffer.concat([encoder.update(JSON.stringify({user: decryptedUser, appPassword: 'dummy-password'})), encoder.final()]);
  const envelope = JSON.stringify({iv: iv.toString('base64'), tag: encoder.getAuthTag().toString('base64'), data: data.toString('base64')});
  const db = new Database(fixture.database);
  db.exec('ALTER TABLE owner_state ADD COLUMN legacy_account TEXT; CREATE TABLE mail_accounts(id TEXT PRIMARY KEY,owner TEXT,user TEXT,label TEXT,secret TEXT,version INTEGER)');
  db.query('INSERT INTO mail_accounts VALUES(?,?,?,?,?,1)').run(id, marker.owner, 'dummy@example.invalid', 'Synthetic', envelope);
  db.query('UPDATE owner_state SET secret=NULL,legacy_account=?').run(id); db.close(); key.fill(0);
  return {id, owner: marker.owner};
}
test('v2 loader selects exact account or verified legacy link without changing custody bytes', () => {
  const f = custodyFixture(); migrateFixture(f);
  try {
    const paths = [f.database, f.markerPath, f.keyPath, f.configPath], before = paths.map(path => readFileSync(path));
    for (const account of ['DUMMY@example.invalid', undefined])
      expect(readOwnerCredential({...options, configPath: f.configPath, account})).toEqual({user: 'dummy@example.invalid', appPassword: 'dummy-password'});
    expect(() => readOwnerCredential({...options, configPath: f.configPath, account: 'other@example.invalid'})).toThrow('EXACT_ACCOUNT_UNAVAILABLE');
    for (const [index,path] of paths.entries()) expect(readFileSync(path)).toEqual(before[index]);
    expect(readdirSync(f.state)).toEqual(['owner.sqlite']);
  } finally {rmSync(f.root, {recursive:true, force:true});}
});
test('v2 loader rejects ambiguity, missing legacy link, changed AAD identity and credential user mismatch', () => {
  for (const fault of ['ambiguous', 'no-link', 'version', 'mismatch', 'foreign-owner'] as const) {
    const f = custodyFixture(), {id, owner} = migrateFixture(f, fault === 'mismatch' ? 'foreign@example.invalid' : undefined);
    try {
      const db = new Database(f.database);
      if (fault === 'ambiguous') db.query('INSERT INTO mail_accounts SELECT ?,owner,upper(user),label,secret,version FROM mail_accounts').run(crypto.randomUUID());
      if (fault === 'no-link') db.exec('UPDATE owner_state SET legacy_account=NULL');
      if (fault === 'version') db.exec('UPDATE mail_accounts SET version=2');
      if (fault === 'foreign-owner') db.exec("UPDATE mail_accounts SET owner='foreign-owner'");
      db.close();
      const account = fault === 'no-link' ? undefined : 'dummy@example.invalid';
      expect(() => readOwnerCredential({...options, configPath: f.configPath, account})).toThrow(
        fault === 'ambiguous' || fault === 'foreign-owner' ? 'EXACT_ACCOUNT_UNAVAILABLE' :
        fault === 'no-link' ? 'EXPLICIT_ACCOUNT_REQUIRED' : fault === 'mismatch' ? 'ACCOUNT_IDENTITY_MISMATCH' : 'CREDENTIAL_CUSTODY_UNAVAILABLE');
    } finally {rmSync(f.root, {recursive:true, force:true});}
  }
});
