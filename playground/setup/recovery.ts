import { Database } from 'bun:sqlite';
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
const hash = (x: string | Buffer) => createHash('sha256').update(x).digest('hex');

// External installation-state model. Provisioning is a separate explicit action.
export class RecoveryGate {
  private db: Database;
  constructor(marker: string) { this.db = new Database(marker, { readwrite: true, create: false }); }
  static provision(marker: string, backup: Buffer, offlineProof: string) {
    if (existsSync(marker)) throw new Error('Already installed');
    const db = new Database(marker, { create: true });
    try {
      db.exec('CREATE TABLE installation(id INTEGER PRIMARY KEY CHECK(id=1), backupHash TEXT, proofHash TEXT)');
      db.query('INSERT INTO installation VALUES(1,?,?)').run(hash(backup), hash(offlineProof));
    } finally { db.close(); }
  }
  checkStartup(servicePath: string) {
    if (!this.db.query('SELECT id FROM installation WHERE id=1').get() || !existsSync(servicePath)) throw new Error('Recovery required');
    let service: Database | undefined;
    try {
      service = new Database(servicePath, { readonly: true });
      if (!(service.query('SELECT owner FROM state WHERE id=1').get() as any)?.owner) throw new Error('Recovery required');
    } catch { throw new Error('Recovery required'); }
    finally { service?.close(); }
  }
  recover(servicePath: string, backup: Buffer, proof: string) {
    if (existsSync(servicePath)) throw new Error('Recovery requires missing state');
    this.db.transaction(() => {
      const row = this.db.query('SELECT * FROM installation WHERE id=1').get() as any;
      if (!row?.proofHash || !timingSafeEqual(Buffer.from(row.proofHash), Buffer.from(hash(proof))) || row.backupHash !== hash(backup)) throw new Error('Recovery rejected');
      // Durable consume first: interrupted restoration cannot replay this proof.
      this.db.query('UPDATE installation SET proofHash=NULL WHERE id=1').run();
    }).immediate();
    writeFileSync(servicePath, backup, { flag: 'wx', mode: 0o600 });
  }
  close() { this.db.close(); }
}
