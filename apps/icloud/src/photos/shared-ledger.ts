import type {Database} from 'bun:sqlite';
// Retained recovery schema; no remote provider or write dispatch.
export function initializeSharedAlbumLedger(db:Database){db.exec(`CREATE TABLE IF NOT EXISTS photos_shared_operations (
 id TEXT PRIMARY KEY,owner TEXT NOT NULL,account TEXT NOT NULL,intent TEXT NOT NULL,
 albumGuid TEXT NOT NULL,snapshot TEXT NOT NULL,status TEXT NOT NULL,result TEXT,expires INTEGER NOT NULL,started INTEGER NOT NULL DEFAULT 0);
 CREATE TABLE IF NOT EXISTS photos_shared_uploads(operationId TEXT PRIMARY KEY,source TEXT NOT NULL,assetGuid TEXT NOT NULL,batchGuid TEXT NOT NULL,submittedAt TEXT NOT NULL,timeZone TEXT NOT NULL,stage TEXT NOT NULL,jobId TEXT)`);}
