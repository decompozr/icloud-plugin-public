import { test, expect, afterEach } from 'bun:test';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Database } from 'bun:sqlite';
import { SetupStore } from './store';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true }); });
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'icloud-setup-experiment-'));
  dirs.push(dir);
  const path = join(dir, 'state.sqlite');
  const key = randomBytes(32), proof = randomBytes(32).toString('hex');
  const store = new SetupStore(path, key);
  store.initialize(proof);
  return { store, path, key, proof };
}
async function worker(input: object) {
  const proc = Bun.spawn([process.execPath, join(import.meta.dir, 'worker.ts')], { stdin: new Blob([JSON.stringify(input)]), stdout: 'pipe', stderr: 'pipe' });
  const [out, err, status] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  expect(status).toBe(0); expect(err).toBe('');
  return out.trim();
}
const dummy = 'dummy-app-password-not-a-real-secret';
test('wrong proof and validation failure preserve retry; completed enrollment stays locked after restart', () => {
  const f = fixture();
  expect(() => f.store.enroll('wrong', 'owner', dummy, () => true)).toThrow('Bootstrap unavailable');
  expect(() => f.store.enroll(f.proof, 'owner', dummy, () => false)).toThrow('Provider validation failed');
  expect(f.store.owner()).toBeNull(); expect(f.store.read()).toBeNull();
  f.store.close();
  const retry = new SetupStore(f.path, f.key);
  retry.enroll(f.proof, 'owner', dummy, () => true); retry.close();
  const restarted = new SetupStore(f.path, f.key);
  try {
    expect(restarted.owner()).toBe('owner');
    expect(() => restarted.enroll(f.proof, 'intruder', dummy, () => true)).toThrow('Bootstrap unavailable');
    expect(() => restarted.initialize(f.proof)).toThrow();
  } finally { restarted.close(); }
});
test('two independent processes racing bootstrap produce exactly one owner', async () => {
  const f = fixture(); f.store.close();
  const input = { action: 'enroll', path: f.path, key: f.key.toString('hex'), proof: f.proof, credential: dummy };
  const outcomes = await Promise.all(['a', 'b'].map(owner => worker({ ...input, owner })));
  expect(outcomes.sort()).toEqual(['claimed', 'rejected']);
  const reopened = new SetupStore(f.path, f.key);
  try { expect(['a', 'b']).toContain(reopened.owner()); expect(reopened.read()).toBe(dummy); }
  finally { reopened.close(); }
});
test('encrypted storage persists across process; rotation and revoke survive restart without reopening bootstrap', async () => {
  const f = fixture();
  f.store.enroll(f.proof, 'owner', dummy, () => true); f.store.close();
  const bytes = readFileSync(f.path);
  expect(bytes.includes(Buffer.from(dummy))).toBe(false);
  expect(bytes.includes(Buffer.from(f.proof))).toBe(false);
  expect(await worker({ action: 'read', path: f.path, key: f.key.toString('hex'), credential: dummy })).toBe('persisted');
  const next = new SetupStore(f.path, f.key);
  next.rotate('rotated-dummy'); expect(next.read()).toBe('rotated-dummy'); next.close();
  const rotated = new SetupStore(f.path, f.key);
  expect(rotated.read()).toBe('rotated-dummy'); rotated.revoke(); rotated.close();
  const revoked = new SetupStore(f.path, f.key);
  try {
    expect(revoked.read()).toBeNull(); expect(revoked.owner()).toBe('owner');
    expect(() => revoked.enroll(f.proof, 'new', dummy, () => true)).toThrow('Bootstrap unavailable');
  } finally { revoked.close(); }
});
test('wrong encryption key and tampered encrypted payload fail closed', () => {
  const f = fixture(); f.store.enroll(f.proof, 'owner', dummy, () => true); f.store.close();
  const wrong = new SetupStore(f.path, randomBytes(32));
  try { expect(() => wrong.read()).toThrow('Credential unavailable'); } finally { wrong.close(); }
  const db = new Database(f.path);
  const payload = JSON.parse((db.query('SELECT secret FROM state').get() as any).secret);
  const ciphertext = Buffer.from(payload[2], 'base64'); ciphertext[0] ^= 1;
  payload[2] = ciphertext.toString('base64');
  db.query('UPDATE state SET secret=?').run(JSON.stringify(payload)); db.close();
  const tampered = new SetupStore(f.path, f.key);
  try { expect(() => tampered.read()).toThrow('Credential unavailable'); } finally { tampered.close(); }
});
