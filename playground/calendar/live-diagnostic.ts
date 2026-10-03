import {Database} from 'bun:sqlite';
import {createDecipheriv, createHmac, timingSafeEqual} from 'node:crypto';
import {readFileSync, statSync, realpathSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';

export type Credential = {user: string; appPassword: string};
export type DiagnosticOptions = {configPath: string; account?: string; confirmOwnerDiagnostic: boolean; start: string; end: string; origins: string[]};
export type DiagnosticReader = {
  discover(): Promise<{href: string}[]>;
  readWindow(calendarHref: string, start: string, end: string): Promise<{resourceCount: number; complete: boolean}>;
};
export type ReaderFactory = (credential: Credential, origins: string[]) => DiagnosticReader;
export class DiagnosticError extends Error {
  constructor(readonly code: string, readonly approvalOrigin?: string) { super(code); }
}
const refuse = (code: string): never => { throw new DiagnosticError(code); };

/** Exact origins only. A discovered Apple shard still needs an explicit entry. */
export function validateDiagnostic(options: DiagnosticOptions) {
  if (options.confirmOwnerDiagnostic !== true) refuse('OWNER_DIAGNOSTIC_CONFIRMATION_REQUIRED');
  if (!options.configPath) refuse('CONFIG_PATH_REQUIRED');
  const from = Date.parse(options.start), to = Date.parse(options.end);
  if (!/Z$/.test(options.start) || !/Z$/.test(options.end) || !Number.isFinite(from) || !Number.isFinite(to)
    || to <= from || to - from > 31 * 86400000) refuse('FINITE_UTC_WINDOW_MAX_31_DAYS_REQUIRED');
  if (!options.origins.length || options.origins.some(origin => !/^https:\/\/(?:caldav|p[0-9]+-caldav)\.icloud\.com$/.test(origin)))
    refuse('EXACT_APPLE_CALDAV_HTTPS_ORIGINS_REQUIRED');
}

function protectedPath(path: string, directory = false) {
  const real = realpathSync(path), stat = statSync(real);
  if ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.() || (directory ? !stat.isDirectory() : !stat.isFile()))
    refuse('OWNER_ONLY_CUSTODY_REQUIRED');
  return real;
}

/** Read-only equivalent of the existing OwnerSecretStore envelope/marker checks.
 * No provisioning, migrations, policy/grant access, or live provider calls.
 */
export function readOwnerCredential(options: DiagnosticOptions): Credential {
  validateDiagnostic(options);
  let key: Buffer | undefined, plaintext: Buffer | undefined, db: Database | undefined;
  try {
    const configPath = protectedPath(options.configPath);
    const config = Bun.TOML.parse(readFileSync(configPath, 'utf8'));
    for (const field of ['state_directory', 'master_key_file', 'installation_marker'])
      if (typeof config[field] !== 'string' || !config[field]) refuse('INVALID_CUSTODY_CONFIG');
    const state = protectedPath(resolve(dirname(configPath), config.state_directory as string), true);
    const keyPath = protectedPath(resolve(dirname(configPath), config.master_key_file as string));
    const markerPath = protectedPath(resolve(dirname(configPath), config.installation_marker as string));
    for (const path of [keyPath, markerPath]) {
      const inside = relative(state, path);
      if (inside !== '..' && !inside.startsWith('../')) refuse('CUSTODY_MUST_BE_OUTSIDE_STATE');
    }
    key = readFileSync(keyPath);
    if (key.length !== 32) refuse('INVALID_CUSTODY_KEY');
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
    if (typeof marker.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(marker.id) || marker.phase !== 'enrolled'
      || typeof marker.owner !== 'string' || !marker.owner || typeof marker.mac !== 'string' || !/^[0-9a-f]{64}$/.test(marker.mac))
      refuse('INVALID_ENROLLED_MARKER');
    const payload = JSON.stringify({version: 1, id: marker.id, phase: 'enrolled', owner: marker.owner});
    const expected = createHmac('sha256', key).update(payload).digest();
    if (!timingSafeEqual(expected, Buffer.from(marker.mac, 'hex'))) refuse('CUSTODY_MARKER_MISMATCH');
    const databasePath = protectedPath(join(state, 'owner.sqlite'));
    db = new Database(databasePath, {readonly: true, create: false});
    const row = db.query('SELECT install,owner,proof,secret,version FROM owner_state WHERE singleton=1').get() as
      {install: string; owner: string; proof: string | null; secret: string | null; version: number} | null;
    if (!row || row.install !== marker.id || row.owner !== marker.owner || row.proof !== null
      || !Number.isSafeInteger(row.version) || row.version < 1) refuse('ENROLLED_CREDENTIAL_UNAVAILABLE');
    let sealed = row.secret, aad = `credential:v1:${row.owner}:${row.version}`, storedUser: string | undefined;
    const hasAccounts = !!db.query("SELECT name FROM sqlite_master WHERE type='table' AND name='mail_accounts'").get();
    if (hasAccounts) {
      type AccountRow = {id: string; owner: string; user: string; secret: string | null; version: number};
      let accounts: AccountRow[];
      if (options.account) {
        accounts = db.query('SELECT id,owner,user,secret,version FROM mail_accounts WHERE owner=? AND lower(user)=lower(?)').all(row.owner, options.account) as AccountRow[];
      } else {
        const columns = db.query('PRAGMA table_info(owner_state)').all() as {name: string}[];
        if (!columns.some(column => column.name === 'legacy_account')) refuse('EXPLICIT_ACCOUNT_REQUIRED');
        const link = db.query('SELECT legacy_account FROM owner_state WHERE singleton=1').get() as {legacy_account: string | null};
        if (!link.legacy_account) refuse('EXPLICIT_ACCOUNT_REQUIRED');
        accounts = db.query('SELECT id,owner,user,secret,version FROM mail_accounts WHERE owner=? AND id=?').all(row.owner, link.legacy_account) as AccountRow[];
      }
      if (accounts.length !== 1) refuse('EXACT_ACCOUNT_UNAVAILABLE');
      const account = accounts[0]!;
      if (account.owner !== row.owner || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(account.id) || typeof account.user !== 'string'
        || !Number.isSafeInteger(account.version) || account.version < 1) refuse('INVALID_ACCOUNT_STATE');
      if (typeof account.secret !== 'string' || !account.secret) refuse('ACCOUNT_CREDENTIAL_UNAVAILABLE');
      sealed = account.secret; storedUser = account.user; aad = `credential:v2:${row.owner}:${account.id}:${account.version}`;
    }
    if (!sealed) refuse('ENROLLED_CREDENTIAL_UNAVAILABLE');
    const envelope = JSON.parse(sealed);
    if (['iv', 'tag', 'data'].some(field => typeof envelope[field] !== 'string')) refuse('INVALID_CREDENTIAL_ENVELOPE');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    plaintext = Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]);
    const credential = JSON.parse(plaintext.toString('utf8'));
    if (typeof credential.user !== 'string' || !credential.user.includes('@') || typeof credential.appPassword !== 'string'
      || !credential.appPassword || Object.keys(credential).some(key => !['user', 'appPassword'].includes(key))) refuse('INVALID_PROVIDER_CREDENTIAL');
    if ((storedUser && credential.user.toLowerCase() !== storedUser.toLowerCase()) ||
      (options.account && credential.user.toLowerCase() !== options.account.toLowerCase())) refuse('ACCOUNT_IDENTITY_MISMATCH');
    return credential;
  } catch (error) {
    if (error instanceof DiagnosticError) throw error;
    // Errors from filesystem, SQLite and parsers can include private file/content details.
    return refuse('CREDENTIAL_CUSTODY_UNAVAILABLE');
  } finally { db?.close(); key?.fill(0); plaintext?.fill(0); }
}

/** Read-only run; output deliberately contains counts only, never identities/hrefs/ICS. */
export async function runDiagnostic(options: DiagnosticOptions, factory: ReaderFactory,
  loadCredential: (options: DiagnosticOptions) => Credential | Promise<Credential> = readOwnerCredential) {
  validateDiagnostic(options);
  let credential: Credential | undefined;
  try {
    credential = await loadCredential(options);
    const reader = factory(credential, [...options.origins]);
    const calendars = await reader.discover();
    if (calendars.length > 25) refuse('CALENDAR_LIMIT_EXCEEDED');
    let resourceCount = 0;
    for (const calendar of calendars) {
      const result = await reader.readWindow(calendar.href, options.start, options.end);
      if (!result.complete || !Number.isSafeInteger(result.resourceCount) || result.resourceCount < 0) refuse('INCOMPLETE_READ');
      resourceCount += result.resourceCount;
      if (resourceCount > 1000) refuse('RESOURCE_LIMIT_EXCEEDED');
    }
    return {mode: 'owner-read-only-diagnostic', calendarCount: calendars.length, resourceCount, complete: true};
  } catch (error) {
    if (error instanceof DiagnosticError) throw error;
    return refuse('CALDAV_READ_FAILED');
  } finally {
    // JS strings cannot be reliably wiped; release references and clear owned buffers above.
    if (credential) { credential.user = ''; credential.appPassword = ''; }
  }
}

export function parseDiagnosticArgs(args: string[]): DiagnosticOptions {
  const options: DiagnosticOptions = {configPath: '', confirmOwnerDiagnostic: false, start: '', end: '', origins: []};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--confirm-owner-calendar-diagnostic') { options.confirmOwnerDiagnostic = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith('--')) refuse('INVALID_DIAGNOSTIC_ARGUMENTS');
    if (arg === '--config') options.configPath = value;
    else if (arg === '--start') options.start = value;
    else if (arg === '--end') options.end = value;
    else if (arg === '--allow-origin') options.origins.push(value);
    else refuse('INVALID_DIAGNOSTIC_ARGUMENTS');
  }
  validateDiagnostic(options);
  return options;
}

export async function appleReaderFactory(): Promise<ReaderFactory> {
  const {createCalDavClient, DAV, CAL, DavRedirectError, DavUntrustedOriginError} = await import('./caldav-client');
  const compact = (value: string) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return (credential, origins) => {
    if (/[:\r\n]/.test(credential.user) || /[\r\n]/.test(credential.appPassword)) refuse('INVALID_PROVIDER_CREDENTIAL');
    const authorization = `Basic ${Buffer.from(`${credential.user}:${credential.appPassword}`).toString('base64')}`;
    const client = createCalDavClient({baseUrl: `${origins[0]}/`, authorization, allowedOrigins: origins, timeoutMs: 10000, maxBytes: 2_000_000});
    const safeRead = async <T>(read: () => Promise<T>): Promise<T> => {
      try { return await read(); } catch (error) {
        let candidate: string | undefined;
        if (error instanceof DavUntrustedOriginError) candidate = error.origin;
        if (error instanceof DavRedirectError && error.location) {
          try { candidate = new URL(error.location, `${origins[0]}/`).origin; } catch {}
        }
        // Emit only the exact Apple origin required for a subsequent explicitly
        // approved invocation, never the private path/query or redirect target.
        if (candidate && /^https:\/\/(?:caldav|p[0-9]+-caldav)\.icloud\.com$/.test(candidate) && !origins.includes(candidate))
          throw new DiagnosticError('CALDAV_ORIGIN_APPROVAL_REQUIRED', candidate);
        if (error instanceof DavRedirectError) throw new DiagnosticError('CALDAV_REDIRECT_REQUIRES_EXPLICIT_REDISCOVERY');
        throw error;
      }
    };
    return {
      async discover() {
        const result = await safeRead(() => client.discover());
        if (result.calendars.some(row => row.errors.length || (row.status !== undefined && row.status !== 200))) refuse('INCOMPLETE_DISCOVERY');
        return result.calendars.map(({href}) => ({href}));
      },
      async readWindow(href, start, end) {
        const rows = await safeRead(() => client.query(href, compact(start), compact(end)));
        return {resourceCount: rows.length, complete: rows.every(row => !row.errors.length
          && (row.status === undefined || row.status === 200)
          && /^"[^"\x00-\x20\x7f]*"$/.test(row.props[`{${DAV}}getetag`] ?? '')
          && typeof row.props[`{${CAL}}calendar-data`] === 'string')};
      },
    };
  };
}

if (import.meta.main) {
  try {
    const options = parseDiagnosticArgs(process.argv.slice(2));
    const result = await runDiagnostic(options, await appleReaderFactory());
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify(error instanceof DiagnosticError ? {error: error.code, approvalOrigin: error.approvalOrigin} : {error: 'DIAGNOSTIC_FAILED'}));
    process.exitCode = 1;
  }
}
