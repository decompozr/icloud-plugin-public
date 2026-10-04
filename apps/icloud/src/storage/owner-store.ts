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
export interface MailAccount { id: string; user: string; label: string; credentialStored: boolean }
export interface OwnerSecretStore {
  ownerId(): string | null;
  checkBootstrapProof(proof: string): void;
  enroll(input: { proof: string; ownerId: string; credential?: Uint8Array }): void;
  listAccounts(ownerId: string): MailAccount[];
  account(ownerId: string, accountId: string): MailAccount;
  accountGeneration?(ownerId:string,accountId:string):number|undefined;
  legacyAccountId(ownerId: string): string | null;
  addAccount(ownerId: string, input: { user: string; label?: string; credential: Uint8Array }): MailAccount;
  readAccountSecret(ownerId: string, accountId: string): Uint8Array | null;
  rotateAccountSecret(ownerId: string, accountId: string, credential: Uint8Array): void;
  revokeAccountSecret(ownerId: string, accountId: string): void;
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
      const store = new SqliteOwnerStore(options, key, db);
      store.migrate(); return store;
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
      store.state(); store.migrate(); return store;
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
  private seal(owner: string, account: string, version: number, bytes: Uint8Array) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(`credential:v2:${owner}:${account}:${version}`));
    const data = Buffer.concat([cipher.update(bytes), cipher.final()]);
    return JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') });
  }
  private unseal(secret: string, aad: string): Uint8Array {
    try {
      const envelope = envelopeSchema.parse(JSON.parse(secret) as unknown);
      const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAAD(Buffer.from(aad));
      decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
    } catch { return fail('SECRET_UNAVAILABLE'); }
  }
  private legacyUser(credential: Uint8Array | null): string {
    try {
      const parsed = JSON.parse(Buffer.from(credential ?? []).toString()) as { user?: unknown };
      if (typeof parsed.user === 'string' && parsed.user.trim()) return parsed.user.trim().toLowerCase();
    } catch { /* Legacy stores also accepted arbitrary opaque credential bytes. */ }
    return 'legacy-account';
  }
  private migrate(): void {
    this.db.transaction(() => {
      const row = this.state();
      const columns = this.db.query('PRAGMA table_info(owner_state)').all() as { name: string }[];
      if (columns.some(column => column.name === 'legacy_account')) {
        // A migrated database must retain the registry and its fixed legacy link.
        this.db.query('SELECT id FROM mail_accounts LIMIT 1').get();
        const link = this.db.query('SELECT legacy_account FROM owner_state WHERE singleton=1').get() as { legacy_account: string | null };
        if (link.legacy_account !== null && !this.db.query('SELECT id FROM mail_accounts WHERE id=? AND owner=?').get(link.legacy_account, row.owner)) fail('STATE_UNAVAILABLE');
        return;
      }
      this.db.exec('ALTER TABLE owner_state ADD COLUMN legacy_account TEXT; CREATE TABLE mail_accounts(id TEXT PRIMARY KEY, owner TEXT NOT NULL, user TEXT NOT NULL, label TEXT NOT NULL, secret TEXT, version INTEGER NOT NULL, UNIQUE(owner,user))');
      if (row.owner && row.version > 0) {
        const credential = row.secret === null ? null : this.unseal(row.secret, `credential:v1:${row.owner}:${row.version}`);
        const id = crypto.randomUUID(), user = this.legacyUser(credential);
        try { this.db.query('INSERT INTO mail_accounts VALUES(?,?,?,?,?,?)').run(id, row.owner, user, user, credential === null ? null : this.seal(row.owner, id, row.version, credential), row.version); }
        finally { credential?.fill(0); }
        this.db.query('UPDATE owner_state SET legacy_account=?,secret=NULL WHERE singleton=1').run(id);
      }
    }).immediate();
  }
  ownerId(): string | null { return this.state().owner; }
  checkBootstrapProof(proof: string): void {
    const row = this.state();
    if (row.owner || !row.proof || !equal(hash(proof), row.proof)) fail('BOOTSTRAP_DENIED');
  }
  enroll(input: { proof: string; ownerId: string; credential?: Uint8Array }): void {
    if (!input.ownerId || input.ownerId.length > 256 || (input.credential !== undefined && !input.credential.byteLength)) fail('INVALID_INPUT');
    try {
      this.db.transaction(() => {
        const row = this.state();
        if (row.owner || !row.proof || !equal(hash(input.proof), row.proof)) fail('BOOTSTRAP_DENIED');
        const id = input.credential ? crypto.randomUUID() : null;
        if (input.credential && id) {
          const user = this.legacyUser(input.credential);
          this.db.query('INSERT INTO mail_accounts VALUES(?,?,?,?,?,1)').run(id, input.ownerId, user, user, this.seal(input.ownerId, id, 1, input.credential));
        }
        this.db.query('UPDATE owner_state SET owner=?,proof=NULL,secret=NULL,version=?,legacy_account=? WHERE singleton=1').run(input.ownerId, id ? 1 : 0, id);
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
  private assertOwner(ownerId: string): void {
    const row = this.state(); if (!row.owner || row.owner !== ownerId) fail('OWNER_DENIED');
  }
  private accountRow(ownerId: string, id: string) {
    this.assertOwner(ownerId);
    const row = this.db.query('SELECT id,user,label,secret,version FROM mail_accounts WHERE owner=? AND id=?').get(ownerId, id);
    if (!row) fail('SECRET_UNAVAILABLE');
    try { return z.object({ id: z.string().uuid(), user: z.string(), label: z.string(), secret: z.string().nullable(), version: z.number().int().positive() }).parse(row); }
    catch { return fail('STATE_UNAVAILABLE'); }
  }
  listAccounts(ownerId: string): MailAccount[] {
    this.assertOwner(ownerId);
    const rows = this.db.query('SELECT id FROM mail_accounts WHERE owner=? ORDER BY rowid').all(ownerId) as { id: string }[];
    return rows.map(row => this.account(ownerId, row.id));
  }
  account(ownerId: string, accountId: string): MailAccount {
    const row = this.accountRow(ownerId, accountId);
    return { id: row.id, user: row.user, label: row.label, credentialStored: row.secret !== null };
  }
  accountGeneration(ownerId:string,accountId:string):number|undefined { const row=this.accountRow(ownerId,accountId);return row.secret===null?undefined:row.version; }
  legacyAccountId(ownerId: string): string | null {
    this.assertOwner(ownerId);
    const row = this.db.query('SELECT legacy_account FROM owner_state WHERE singleton=1').get() as { legacy_account: string | null };
    return row.legacy_account;
  }
  addAccount(ownerId: string, input: { user: string; label?: string; credential: Uint8Array }): MailAccount {
    const user = input.user.trim().toLowerCase(), label = input.label?.trim() || user;
    if (!user || user.length > 320 || label.length > 320 || !input.credential.byteLength) fail('INVALID_INPUT');
    try {
      return this.db.transaction(() => {
        this.assertOwner(ownerId);
        const existing = this.db.query('SELECT id,secret FROM mail_accounts WHERE owner=? AND user=?').get(ownerId, user) as { id: string; secret: string | null } | null;
        if (existing) {
          if (existing.secret !== null) fail('INVALID_INPUT');
          this.rotateAccountSecret(ownerId, existing.id, input.credential);
          return this.account(ownerId, existing.id);
        }
        const id = crypto.randomUUID();
        this.db.query('INSERT INTO mail_accounts VALUES(?,?,?,?,?,1)').run(id, ownerId, user, label, this.seal(ownerId, id, 1, input.credential));
        return this.account(ownerId, id);
      }).immediate();
    } catch (error) { if (error instanceof OwnerStorageError) throw error; return fail('STATE_UNAVAILABLE'); }
  }
  readAccountSecret(ownerId: string, accountId: string): Uint8Array | null {
    const row = this.accountRow(ownerId, accountId);
    return row.secret === null ? null : this.unseal(row.secret, `credential:v2:${ownerId}:${row.id}:${row.version}`);
  }
  rotateAccountSecret(ownerId: string, accountId: string, credential: Uint8Array): void {
    if (!credential.byteLength) fail('INVALID_INPUT');
    this.mutate(ownerId, accountId, credential);
  }
  revokeAccountSecret(ownerId: string, accountId: string): void { this.mutate(ownerId, accountId, null); }
  readSecret(ownerId: string): Uint8Array | null {
    const id = this.legacyAccountId(ownerId);
    return id === null ? null : this.readAccountSecret(ownerId, id);
  }
  rotateSecret(ownerId: string, credential: Uint8Array): void {
    if (!credential.byteLength) fail('INVALID_INPUT');
    const id = this.legacyAccountId(ownerId);
    if (id === null) return fail('SECRET_UNAVAILABLE');
    this.rotateAccountSecret(ownerId, id, credential);
  }
  revokeSecret(ownerId: string): void {
    const id = this.legacyAccountId(ownerId);
    if (id !== null) this.revokeAccountSecret(ownerId, id);
  }
  private mutate(ownerId: string, accountId: string, credential: Uint8Array | null) {
    try {
      this.db.transaction(() => {
        const row = this.accountRow(ownerId, accountId), version = row.version + 1;
        this.db.query('UPDATE mail_accounts SET secret=?,version=? WHERE owner=? AND id=?').run(credential === null ? null : this.seal(ownerId, accountId, version, credential), version, ownerId, accountId);
      }).immediate();
    } catch (error) { if (error instanceof OwnerStorageError) throw error; fail('STATE_UNAVAILABLE'); }
  }
  close(): void { this.db.close(); this.key.fill(0); }
}
