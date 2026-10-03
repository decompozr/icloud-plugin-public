import { Database } from 'bun:sqlite';
import { createHash, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export class SetupStore {
  private db: Database;
  constructor(path: string, private key: Buffer) {
    if (key.length !== 32) throw new Error('Invalid key length');
    this.db = new Database(path, { create: true });
    this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), proof TEXT, owner TEXT, secret TEXT)');
  }
  initialize(proof: string) {
    this.db.query('INSERT INTO state(id,proof) VALUES(1,?)').run(digest(proof));
  }
  private seal(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from('icloud-plugin:dummy-provider:v1'));
    const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return JSON.stringify([iv, cipher.getAuthTag(), data].map(x => x.toString('base64')));
  }
  private open(value: string) {
    try {
      const [iv, tag, data] = JSON.parse(value).map((x: string) => Buffer.from(x, 'base64'));
      const cipher = createDecipheriv('aes-256-gcm', this.key, iv);
      cipher.setAAD(Buffer.from('icloud-plugin:dummy-provider:v1'));
      cipher.setAuthTag(tag);
      return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
    } catch { throw new Error('Credential unavailable'); }
  }
  enroll(proof: string, owner: string, credential: string, validate: (s: string) => boolean) {
    // BEGIN IMMEDIATE serializes ownership claims across processes.
    this.db.transaction(() => {
      const row = this.db.query('SELECT * FROM state WHERE id=1').get() as any;
      if (!row || row.owner || !row.proof || !timingSafeEqual(Buffer.from(digest(proof)), Buffer.from(row.proof))) throw new Error('Bootstrap unavailable');
      if (!validate(credential)) throw new Error('Provider validation failed');
      this.db.query('UPDATE state SET proof=NULL,owner=?,secret=? WHERE id=1').run(owner, this.seal(credential));
    }).immediate();
  }
  owner(): string | null { return (this.db.query('SELECT owner FROM state WHERE id=1').get() as any)?.owner ?? null; }
  read(): string | null {
    const value = (this.db.query('SELECT secret FROM state WHERE id=1').get() as any)?.secret;
    return value ? this.open(value) : null;
  }
  // These methods model storage only: production must authenticate the owner.
  rotate(value: string) {
    if (!this.owner()) throw new Error('Owner required');
    this.db.query('UPDATE state SET secret=? WHERE id=1').run(this.seal(value));
  }
  revoke() { this.db.query('UPDATE state SET secret=NULL WHERE id=1').run(); }
  close() { this.db.close(); }
}
