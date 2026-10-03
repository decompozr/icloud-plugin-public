import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, createCipheriv } from 'node:crypto';
import { Database } from 'bun:sqlite';
import { SqliteOwnerStore } from './owner-store.js';
function fixture() {
 const dir = mkdtempSync(join(tmpdir(), 'icloud-storage-'));
 const options = { databasePath: join(dir, 'app.db'), markerPath: join(dir, 'external.marker'), masterKey: randomBytes(32), bootstrapProof: randomBytes(32).toString('hex') };
 return { dir, options, cleanup: () => rmSync(dir, { recursive: true }) };
}
const enroll = (store: SqliteOwnerStore, proof: string) => store.enroll({ proof, ownerId: 'owner', credential: Buffer.from('dummy-secret') });
async function worker(options: ReturnType<typeof fixture>['options'], owner: string, action: 'enroll' | 'read' | 'add') {
 const proc = Bun.spawn([process.execPath, join(import.meta.dir, 'owner-store.worker.ts')], { stdin: new Blob([JSON.stringify({ ...options, key: Buffer.from(options.masterKey).toString('hex'), proof: options.bootstrapProof, owner, action })]), stdout: 'pipe', stderr: 'pipe' });
 const [output, errors, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
 expect(code).toBe(0); expect(errors).toBe(''); return output.trim();
}
test('exclusive bootstrap, typed owner checks, encrypted persistence, rotation and revoke', async () => {
 const f = fixture();
 try {
  let store = SqliteOwnerStore.provision(f.options);
  expect(() => store.checkBootstrapProof('bad')).toThrow('BOOTSTRAP_DENIED');
  store.checkBootstrapProof(f.options.bootstrapProof);
  expect(() => enroll(store, 'bad')).toThrow('BOOTSTRAP_DENIED'); expect(store.ownerId()).toBeNull();
  enroll(store, f.options.bootstrapProof);
  expect(() => store.checkBootstrapProof(f.options.bootstrapProof)).toThrow('BOOTSTRAP_DENIED');
  expect(() => enroll(store, f.options.bootstrapProof)).toThrow('BOOTSTRAP_DENIED');
  expect(() => store.readSecret('other')).toThrow('OWNER_DENIED');
  store.close();
  expect(readFileSync(f.options.databasePath).includes(Buffer.from('dummy-secret'))).toBe(false);
  expect(readFileSync(f.options.databasePath).includes(Buffer.from(f.options.bootstrapProof))).toBe(false);
  expect(await worker(f.options, 'owner', 'read')).toBe('persisted');
  store = SqliteOwnerStore.open(f.options); store.rotateSecret('owner', Buffer.from('rotated-dummy')); store.close();
  store = SqliteOwnerStore.open(f.options); expect(Buffer.from(store.readSecret('owner') ?? []).toString()).toBe('rotated-dummy');
  store.revokeSecret('owner'); store.close();
  store = SqliteOwnerStore.open(f.options); expect(store.readSecret('owner')).toBeNull(); expect(store.ownerId()).toBe('owner');
  expect(() => enroll(store, f.options.bootstrapProof)).toThrow('BOOTSTRAP_DENIED'); store.close();
 } finally { f.cleanup(); }
});
test('independent process enrollment race has one winner', async () => {
 const f = fixture();
 try { SqliteOwnerStore.provision(f.options).close(); expect((await Promise.all(['a','b'].map(x => worker(f.options, x, 'enroll')))).sort()).toEqual(['claimed','rejected']); }
 finally { f.cleanup(); }
});
test('missing or corrupt established state and wrong key fail closed; provision never resets', () => {
 const f = fixture();
 try {
  const store = SqliteOwnerStore.provision(f.options); enroll(store, f.options.bootstrapProof); store.close();
  expect(() => SqliteOwnerStore.provision(f.options)).toThrow('STATE_UNAVAILABLE');
  expect(() => SqliteOwnerStore.open({ ...f.options, masterKey: randomBytes(32) })).toThrow('STATE_UNAVAILABLE');
  rmSync(f.options.databasePath);
  expect(() => SqliteOwnerStore.open(f.options)).toThrow('STATE_UNAVAILABLE'); expect(existsSync(f.options.databasePath)).toBe(false);
  expect(() => SqliteOwnerStore.provision(f.options)).toThrow('STATE_UNAVAILABLE');
  writeFileSync(f.options.databasePath, 'corrupt'); expect(() => SqliteOwnerStore.open(f.options)).toThrow('STATE_UNAVAILABLE');
  rmSync(f.options.markerPath); expect(() => SqliteOwnerStore.open(f.options)).toThrow('STATE_UNAVAILABLE');
 } finally { f.cleanup(); }
});
test('ciphertext tampering and incomplete enrollment marker mismatch reject', () => {
 const f = fixture();
 try {
  const store = SqliteOwnerStore.provision(f.options), pending = readFileSync(f.options.markerPath); enroll(store, f.options.bootstrapProof); store.close();
  const db = new Database(f.options.databasePath); db.query('UPDATE mail_accounts SET secret=?').run('{}'); db.close();
  const reopened = SqliteOwnerStore.open(f.options); expect(() => reopened.readSecret('owner')).toThrow('SECRET_UNAVAILABLE'); reopened.close();
  writeFileSync(f.options.markerPath, pending); expect(() => SqliteOwnerStore.open(f.options)).toThrow('STATE_UNAVAILABLE');
 } finally { f.cleanup(); }
});
test('SQLite failure rolls back enrollment and returns redacted error; retry remains possible', () => {
 const f = fixture();
 try {
  const store = SqliteOwnerStore.provision(f.options);
  const db = new Database(f.options.databasePath);
  db.exec("CREATE TRIGGER reject_enrollment BEFORE UPDATE ON owner_state BEGIN SELECT RAISE(ABORT, 'dummy-secret-must-not-escape'); END");
  try {
   expect(() => enroll(store, f.options.bootstrapProof)).toThrow('STATE_UNAVAILABLE');
   expect(store.ownerId()).toBeNull();
   db.exec('DROP TRIGGER reject_enrollment');
   enroll(store, f.options.bootstrapProof); expect(store.ownerId()).toBe('owner');
  } finally { db.close(); store.close(); }
 } finally { f.cleanup(); }
});

test('authenticated marker binds owner and rejects terminal-marker pending-DB crash state', () => {
 const f = fixture();
 try {
  const store = SqliteOwnerStore.provision(f.options);
  const pendingDb = readFileSync(f.options.databasePath);
  enroll(store, f.options.bootstrapProof); store.close();
  const enrolledDb = readFileSync(f.options.databasePath);
  const db = new Database(f.options.databasePath);
  db.query('UPDATE owner_state SET owner=?').run('substituted-owner'); db.close();
  expect(() => SqliteOwnerStore.open(f.options)).toThrow('STATE_UNAVAILABLE');
  writeFileSync(f.options.databasePath, pendingDb);
  expect(() => SqliteOwnerStore.open(f.options)).toThrow('STATE_UNAVAILABLE');
  writeFileSync(f.options.databasePath, enrolledDb);
  const restored = SqliteOwnerStore.open(f.options);
  expect(restored.ownerId()).toBe('owner'); restored.close();
 } finally { f.cleanup(); }
});

test('owner-only bootstrap has no implicit legacy account; accounts isolate credentials and renew stable identity', () => {
 const f = fixture();
 try {
  let store = SqliteOwnerStore.provision(f.options);
  store.enroll({ proof: f.options.bootstrapProof, ownerId: 'owner' });
  expect(() => store.checkBootstrapProof(f.options.bootstrapProof)).toThrow('BOOTSTRAP_DENIED');
  expect(store.listAccounts('owner')).toEqual([]);
  const a = store.addAccount('owner', { user: ' A@icloud.com ', label: 'Personal', credential: Buffer.from('secret-a') });
  const b = store.addAccount('owner', { user: 'b@icloud.com', credential: Buffer.from('secret-b') });
  expect(a.user).toBe('a@icloud.com'); expect(a.id).not.toBe(b.id);
  expect(store.legacyAccountId('owner')).toBeNull(); expect(store.readSecret('owner')).toBeNull();
  expect(() => store.rotateSecret('owner', Buffer.from('old-grant'))).toThrow('SECRET_UNAVAILABLE');
  expect(() => store.addAccount('owner', { user: 'A@ICLOUD.COM', credential: Buffer.from('overwrite') })).toThrow('INVALID_INPUT');
  expect(() => store.readAccountSecret('other', a.id)).toThrow('OWNER_DENIED');
  expect(() => store.readAccountSecret('owner', 'unknown')).toThrow('SECRET_UNAVAILABLE');
  store.revokeAccountSecret('owner', a.id);
  expect(store.account('owner', a.id).credentialStored).toBe(false);
  const renewed = store.addAccount('owner', { user: 'A@icloud.com', credential: Buffer.from('renewed-a') });
  expect(renewed.id).toBe(a.id); expect(renewed.label).toBe('Personal');
  store.close(); store = SqliteOwnerStore.open(f.options);
  expect(store.listAccounts('owner')).toHaveLength(2);
  expect(Buffer.from(store.readAccountSecret('owner', a.id) ?? []).toString()).toBe('renewed-a');
  expect(Buffer.from(store.readAccountSecret('owner', b.id) ?? []).toString()).toBe('secret-b');
  expect(store.legacyAccountId('owner')).toBeNull(); store.close();
  const bytes = readFileSync(f.options.databasePath);
  expect(bytes.includes(Buffer.from('renewed-a'))).toBe(false);
  expect(bytes.includes(Buffer.from('secret-b'))).toBe(false);
 } finally { f.cleanup(); }
});
test('opening original singleton atomically migrates arbitrary bytes and fixes legacy binding', () => {
 const f = fixture();
 try {
  const initial = SqliteOwnerStore.provision(f.options); enroll(initial, f.options.bootstrapProof); initial.close();
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', f.options.masterKey, iv);
  cipher.setAAD(Buffer.from('credential:v1:owner:7'));
  const data = Buffer.concat([cipher.update(Buffer.from('opaque-original-secret')), cipher.final()]);
  const legacy = JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
  const db = new Database(f.options.databasePath);
  db.exec('DROP TABLE mail_accounts; ALTER TABLE owner_state DROP COLUMN legacy_account');
  db.query('UPDATE owner_state SET secret=?,version=7').run(legacy); db.close();
  let store = SqliteOwnerStore.open(f.options);
  const id = store.legacyAccountId('owner'); expect(id).not.toBeNull();
  expect(Buffer.from(store.readSecret('owner') ?? []).toString()).toBe('opaque-original-secret');
  store.addAccount('owner', { user: 'b@icloud.com', credential: Buffer.from('secret-b') });
  store.revokeSecret('owner'); store.close(); store = SqliteOwnerStore.open(f.options);
  expect(store.legacyAccountId('owner')).toBe(id); expect(store.readSecret('owner')).toBeNull();
  store.rotateSecret('owner', Buffer.from('legacy-renewed'));
  expect(Buffer.from(store.readAccountSecret('owner', id!) ?? []).toString()).toBe('legacy-renewed'); store.close();
 } finally { f.cleanup(); }
});
test('ciphertext substitution between accounts fails authentication', () => {
 const f = fixture();
 try {
  const store = SqliteOwnerStore.provision(f.options); store.enroll({ proof: f.options.bootstrapProof, ownerId: 'owner' });
  const a = store.addAccount('owner', { user: 'a@icloud.com', credential: Buffer.from('secret-a') });
  const b = store.addAccount('owner', { user: 'b@icloud.com', credential: Buffer.from('secret-b') });
  const db = new Database(f.options.databasePath);
  db.query('UPDATE mail_accounts SET secret=(SELECT secret FROM mail_accounts WHERE id=?) WHERE id=?').run(a.id, b.id); db.close();
  expect(() => store.readAccountSecret('owner', b.id)).toThrow('SECRET_UNAVAILABLE'); store.close();
 } finally { f.cleanup(); }
});

test('independent process duplicate account race preserves one identity and one secret', async () => {
 const f = fixture();
 try {
  const store = SqliteOwnerStore.provision(f.options); store.enroll({ proof: f.options.bootstrapProof, ownerId: 'owner' }); store.close();
  expect((await Promise.all([worker(f.options, 'owner', 'add'), worker(f.options, 'owner', 'add')])).sort()).toEqual(['added', 'rejected']);
  const reopened = SqliteOwnerStore.open(f.options); expect(reopened.listAccounts('owner')).toHaveLength(1); reopened.close();
 } finally { f.cleanup(); }
});

test('migration preserves legacy login metadata and already revoked legacy identity', () => {
 for (const revoked of [false, true]) {
  const f = fixture();
  try {
   const initial = SqliteOwnerStore.provision(f.options); enroll(initial, f.options.bootstrapProof); initial.close();
   const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', f.options.masterKey, iv);
   cipher.setAAD(Buffer.from('credential:v1:owner:2'));
   const data = Buffer.concat([cipher.update(Buffer.from(JSON.stringify({ user: 'Legacy@icloud.com', appPassword: 'legacy-private' }))), cipher.final()]);
   const secret = JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
   const db = new Database(f.options.databasePath);
   db.exec('DROP TABLE mail_accounts; ALTER TABLE owner_state DROP COLUMN legacy_account');
   db.query('UPDATE owner_state SET secret=?,version=2').run(revoked ? null : secret); db.close();
   const store = SqliteOwnerStore.open(f.options), id = store.legacyAccountId('owner');
   expect(id).not.toBeNull(); expect(store.account('owner', id!).credentialStored).toBe(!revoked);
   expect(store.account('owner', id!).user).toBe(revoked ? 'legacy-account' : 'legacy@icloud.com');
   const added = store.addAccount('owner', { user: 'new@icloud.com', credential: Buffer.from('new-secret') });
   expect(added.id).not.toBe(id); expect(store.legacyAccountId('owner')).toBe(id);
   if (revoked) expect(store.readSecret('owner')).toBeNull();
   store.close();
  } finally { f.cleanup(); }
 }
});
