import { SqliteOwnerStore } from './owner-store.js';
import { z } from 'zod';
const input = z.object({ databasePath: z.string(), markerPath: z.string(), key: z.string(), proof: z.string(), owner: z.string(), action: z.enum(['enroll', 'read', 'add']) }).parse(JSON.parse(await Bun.stdin.text()) as unknown);
let store: SqliteOwnerStore | undefined;
try {
  store = SqliteOwnerStore.open({ ...input, masterKey: Buffer.from(input.key, 'hex') });
  if (input.action === 'enroll') { store.enroll({ proof: input.proof, ownerId: input.owner, credential: Buffer.from('dummy-secret') }); console.log('claimed'); }
  else if (input.action === 'add') { store.addAccount(input.owner, { user: 'race@icloud.com', credential: Buffer.from('race-secret') }); console.log('added'); }
  else { if (Buffer.from(store.readSecret(input.owner) ?? []).toString() !== 'dummy-secret') throw new Error(); console.log('persisted'); }
} catch { console.log('rejected'); }
finally { store?.close(); }
