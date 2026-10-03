import { Database } from 'bun:sqlite';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync, rmSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { z } from 'zod';
import { dirname } from 'node:path';

export type StorageErrorCode = 'STATE_UNAVAILABLE' | 'BOOTSTRAP_DENIED' | 'OWNER_DENIED' | 'SECRET_UNAVAILABLE' | 'INVALID_INPUT';
export class OwnerStorageError extends Error {
  constructor(readonly code: StorageErrorCode) { super(code); this.name = 'OwnerStorageError'; }
}
export interface OwnerStoreOptions { databasePath: string; markerPath: string; masterKey: Uint8Array }
export interface OwnerSecretStore {
  ownerId(): string | null;
  checkBootstrapProof(proof: string): void;
  enroll(input: { proof: string; ownerId: string; credential: Uint8Array }): void;
  readSecret(ownerId: string): Uint8Array | null;
  rotateSecret(ownerId: string, credential: Uint8Array): void;
  revokeSecret(ownerId: string): void;
  close(): void;
}
const markerSchema = z.object({ id: z.string().uuid(), phase: z.enum(['pending', 'enrolled']), owner: z.string().min(1).nullable(), mac: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const rowSchema = z.object({ install: z.string().uuid(), owner: z.string().nullable(), proof: z.string().nullable(), secret: z.string().nullable(), version: z.number().int().nonnegative() });
const envelopeSchema = z.object({ iv: z.string(), tag: z.string(), data: z.string() }).strict();
type Marker = z.infer<typeof markerSchema>;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const fail = (code: StorageErrorCode): never => { throw new OwnerStorageError(code); };
const equal = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export class SqliteOwnerStore implements OwnerSecretStore {
  private constructor(private options: OwnerStoreOptions, private key: Buffer, private db: Database) {}
  static provision(options: OwnerStoreOptions & { bootstrapProof: string }): SqliteOwnerStore {
    if (options.masterKey.byteLength !== 32 || options.bootstrapProof.length < 32 || options.databasePath === options.markerPath) fail('INVALID_INPUT');
    if (existsSync(options.databasePath) || existsSync(options.markerPath)) fail('STATE_UNAVAILABLE');
    const key = Buffer.from(options.masterKey), id = crypto.randomUUID();
    let db: Database | undefined;
    try {
      // Exclusive files reserve this installation. Partial provisioning stays closed.
      writeFileSync(options.markerPath, SqliteOwnerStore.marker(id, 'pending', key), { flag: 'wx', mode: 0o600 });
      writeFileSync(options.databasePath, '', { flag: 'wx', mode: 0o600 });
      db = new Database(options.databasePath, { readwrite: true });
      db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL; CREATE TABLE owner_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1), install TEXT NOT NULL, owner TEXT, proof TEXT, secret TEXT, version INTEGER NOT NULL)');
      db.query('INSERT INTO owner_state VALUES(1,?,NULL,?,NULL,0)').run(id, hash(options.bootstrapProof));
      return new SqliteOwnerStore(options, key, db);
    } catch { db?.close(); key.fill(0); return fail('STATE_UNAVAILABLE'); }
  }
  static open(options: OwnerStoreOptions): SqliteOwnerStore {
    if (options.masterKey.byteLength !== 32) fail('INVALID_INPUT');
    const key = Buffer.from(options.masterKey);
    let db: Database | undefined;
    try {
      db = new Database(options.databasePath, { readwrite: true, create: false });
      db.exec('PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL');
      const store = new SqliteOwnerStore(options, key, db);
      store.state(); return store;
    } catch { db?.close(); key.fill(0); return fail('STATE_UNAVAILABLE'); }
  }
  private static marker(id: string, phase: Marker['phase'], key: Buffer, owner: string | null = null): string {
    const payload = JSON.stringify({ version: 1, id, phase, owner });
    return JSON.stringify({ id, phase, owner, mac: createHmac('sha256', key).update(payload).digest('hex') });
  }
  private state() {
    try {
      const marker = markerSchema.parse(JSON.parse(readFileSync(this.options.markerPath, 'utf8')) as unknown);
      const expected = markerSchema.parse(JSON.parse(SqliteOwnerStore.marker(marker.id, marker.phase, this.key, marker.owner)) as unknown);
      const row = rowSchema.parse(this.db.query('SELECT install,owner,proof,secret,version FROM owner_state WHERE singleton=1').get());
      if (!equal(marker.mac, expected.mac) || row.install !== marker.id || row.owner !== marker.owner || (marker.phase === 'enrolled') !== (row.owner !== null) || (row.owner !== null && row.proof !== null)) fail('STATE_UNAVAILABLE');
      return row;
    } catch { return fail('STATE_UNAVAILABLE'); }
  }
  private seal(owner: string, version: number, bytes: Uint8Array) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`credential:v1:${owner}:${version}`));
    const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
  }
  ownerId(): string | null { return this.state().owner; }
  checkBootstrapProof(proof: string): void {
    const row = this.state();
    if (row.owner || !row.proof || !equal(hash(proof), row.proof)) fail('BOOTSTRAP_DENIED');
  }
  enroll(input: { proof: string; ownerId: string; credential: Uint8Array }): void {
    if (!input.ownerId || input.ownerId.length > 256 || !input.credential.byteLength) fail('INVALID_INPUT');
    try {
      this.db.transaction(() => {
        const row = this.state();
        if (row.owner || !row.proof || !equal(hash(input.proof), row.proof)) fail('BOOTSTRAP_DENIED');
        this.db.query('UPDATE owner_state SET owner=?,proof=NULL,secret=?,version=1 WHERE singleton=1').run(input.ownerId, this.seal(input.ownerId, 1, input.credential));
        const temporary = `${this.options.markerPath}.${crypto.randomUUID()}.tmp`;
        try {
          writeFileSync(temporary, SqliteOwnerStore.marker(row.install, 'enrolled', this.key, input.ownerId), { flag: 'wx', mode: 0o600 });
          const descriptor = openSync(temporary, 'r');
          try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
          renameSync(temporary, this.options.markerPath);
          const directory = openSync(dirname(this.options.markerPath), 'r');
          try { fsyncSync(directory); } finally { closeSync(directory); }
        } finally { rmSync(temporary, { force: true }); }
      }).immediate();
    } catch (error) { if (error instanceof OwnerStorageError) throw error; fail('STATE_UNAVAILABLE'); }
  }
  readSecret(ownerId: string): Uint8Array | null {
    const row = this.state(); if (row.owner !== ownerId || !row.owner) fail('OWNER_DENIED');
    if (row.secret === null) return null;
    try {
      const envelope = envelopeSchema.parse(JSON.parse(row.secret) as unknown);
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAAD(Buffer.from(`credential:v1:${ownerId}:${row.version}`));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
    } catch { return fail('SECRET_UNAVAILABLE'); }
  }
  rotateSecret(ownerId: string, credential: Uint8Array): void {
    if (!credential.byteLength) fail('INVALID_INPUT');
    this.mutate(ownerId, credential);
  }
  revokeSecret(ownerId: string): void { this.mutate(ownerId, null); }
  private mutate(ownerId: string, credential: Uint8Array | null) {
    try {
      this.db.transaction(() => {
        const row = this.state(); if (!row.owner || row.owner !== ownerId) fail('OWNER_DENIED');
        const version = row.version + 1;
        this.db.query('UPDATE owner_state SET secret=?,version=? WHERE singleton=1').run(credential === null ? null : this.seal(ownerId, version, credential), version);
      }).immediate();
    } catch (error) { if (error instanceof OwnerStorageError) throw error; fail('STATE_UNAVAILABLE'); }
  }
  close(): void { this.db.close(); this.key.fill(0); }
}
