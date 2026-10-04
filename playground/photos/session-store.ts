import {constants} from 'node:fs';
import {open, lstat, mkdir, rename, unlink} from 'node:fs/promises';
import {join, isAbsolute, resolve, dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {ProbeError} from './probe-diagnostics';
export interface SavedSession {version: 1; dsid: string; accountName: string; clientId: string; cookies: unknown; headers: Record<string,string>;}
const LIMIT = 256 * 1024;
const headerNames = ['scnt','x-apple-id-session-id','x-apple-id-account-country','x-apple-session-token','x-apple-twosv-trust-token'];
export function checkedSession(value: unknown): SavedSession {
  const x = value as SavedSession;
  if (!x || x.version !== 1 || Object.keys(x).sort().join() !== 'accountName,clientId,cookies,dsid,headers,version' || typeof x.dsid !== 'string' || !/^\d{1,32}$/.test(x.dsid) || typeof x.accountName !== 'string' || !x.accountName.trim() || x.accountName.length > 1024 || typeof x.clientId !== 'string' || !/^auth-[a-f0-9-]{36}$/.test(x.clientId) || !x.headers || typeof x.headers !== 'object' || Array.isArray(x.headers)) throw new ProbeError('session_cache_invalid');
  for (const [k,v] of Object.entries(x.headers)) if (!headerNames.includes(k) || typeof v !== 'string' || v.length > 16384 || /[\r\n]/.test(v)) throw new ProbeError('session_cache_invalid');
  const jar = x.cookies as any;
  if (!jar || !Array.isArray(jar.cookies) || jar.cookies.length > 256) throw new ProbeError('session_cache_invalid');
  // tough-cookie omits default values when serializing: a valid `name=` cookie
  // has no `value` field, and deserialization restores the empty string.
  for (const c of jar.cookies) if (!c || typeof c.domain !== 'string' || !/^(?:apple\.com|idmsa\.apple\.com|(?:[a-z0-9-]+\.)*icloud\.com)$/.test(c.domain) || typeof c.key !== 'string' || (c.value !== undefined && typeof c.value !== 'string') || c.key.length + (c.value ?? '').length > 16384) throw new ProbeError('session_cache_invalid');
  if (Buffer.byteLength(JSON.stringify(x)) > LIMIT) throw new ProbeError('session_cache_invalid');
  return x;
}
export class SessionStore {
  readonly directory: string;
  constructor(directory: string) { if (!isAbsolute(directory) || resolve(directory) !== directory || dirname(directory) === directory) throw new ProbeError('session_cache_unsafe'); this.directory=directory; }
  async #directory() {
    // Refuse links in every ancestor; do not chmod or alter pre-existing directories.
    let p = this.directory;
    const ancestors: string[]=[];
    while (p !== dirname(p)) { ancestors.unshift(p); p=dirname(p); }
    for (const path of ancestors) {
      let s = await lstat(path).catch((e) => {if(e.code === 'ENOENT' && path === this.directory) return null; throw e;});
      if (!s) { await mkdir(path,{mode:0o700}); s=await lstat(path); }
      if (!s.isDirectory() || s.isSymbolicLink()) throw new ProbeError('session_cache_unsafe');
      if (path === this.directory && ((s.mode & 0o777) !== 0o700 || s.uid !== process.getuid?.())) throw new ProbeError('session_cache_unsafe');
    }
  }
  async load(): Promise<SavedSession | undefined> {
    try {
      await this.#directory();
      const file=await open(join(this.directory,'session.json'),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK).catch(e=>{if(e.code==='ENOENT')return undefined;throw e;});
      if (!file) return;
      try { const s=await file.stat(); if(!s.isFile() || s.nlink!==1 || (s.mode&0o777)!==0o600 || s.uid!==process.getuid?.() || s.size>LIMIT)throw new ProbeError('session_cache_unsafe'); const buffer=Buffer.alloc(LIMIT+1); const {bytesRead}=await file.read(buffer,0,buffer.length,0); if(bytesRead>LIMIT)throw new ProbeError('session_cache_invalid'); return checkedSession(JSON.parse(buffer.subarray(0,bytesRead).toString('utf8'))); } finally {await file.close();}
    } catch(e) {if(e instanceof ProbeError)throw e;throw new ProbeError('session_cache_invalid');}
  }
  async save(session: SavedSession) {
    const body=JSON.stringify(checkedSession(session));
    let temporary: string|undefined;
    try {await this.#directory(); await this.load(); temporary=join(this.directory,`.session-${randomUUID()}.tmp`); const file=await open(temporary,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600); try {await file.writeFile(body);await file.sync();}finally{await file.close();} await rename(temporary,join(this.directory,'session.json')); temporary=undefined;
    }catch(e){if(e instanceof ProbeError)throw e;throw new ProbeError('session_cache_write_failed');}finally{if(temporary)await unlink(temporary).catch(()=>{});}
  }
}
