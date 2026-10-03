import { test, expect } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Database } from 'bun:sqlite';
import { SqliteOwnerStore } from './owner-store.js';
function fixture() {
 const dir = mkdtempSync(join(tmpdir(), 'icloud-storage-'));
 const options = { databasePath: join(dir, 'app.db'), markerPath: join(dir, 'external.marker'), masterKey: randomBytes(32), bootstrapProof: randomBytes(32).toString('hex') };
 return { dir, options, cleanup: () => rmSync(dir, { recursive: true }) };
}
const enroll = (store: SqliteOwnerStore, proof: string) => store.enroll({ proof, ownerId: 'owner', credential: Buffer.from('dummy-secret') });
async function worker(options: ReturnType<typeof fixture>['options'], owner: string, action: 'enroll' | 'read') {
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
  const db = new Database(f.options.databasePath); db.query('UPDATE owner_state SET secret=?').run('{}'); db.close();
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
