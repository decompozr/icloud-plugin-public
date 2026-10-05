import {SessionStore} from './session-store';
import {AppleAuthClient, AppleAuthError, type AuthenticatedAppleSession} from './apple-auth';
import {resolve, relative, isAbsolute} from 'node:path';
import { probeFailure, type ProbeContext } from "./probe-diagnostics";
import { StringDecoder } from 'node:string_decoder';
// Run only in the user's own terminal. Password/OTP stay in memory; session persistence is opt-in.
import { cloudEvidence, readCloudPhotos } from './cloud-client';
import { albumEvidence, readCloudAlbums } from './cloud-albums';
import { readCloudPersonSchema } from './cloud-person-schema';
import {resumePersonSchema} from './schema-cursor';
import {monthBounds,readCloudMonth} from './cloud-month';

export async function hiddenPrompt(label: string, input = process.stdin, output = process.stderr, signals: NodeJS.EventEmitter = process): Promise<string> {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) throw new Error('Interactive terminal required');
  output.write(label);
  const previousRaw = input.isRaw;
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    let finished = false;
    const decoder = new StringDecoder('utf8');
    const cancelled = () => finish(new Error('Input cancelled'));
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      input.off('data', onData);
      for (const event of ['end', 'close', 'error']) input.off(event, cancelled);
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) signals.off(signal, cancelled);
      try { input.setRawMode(previousRaw); }
      catch { error = new Error('Terminal restoration failed'); }
      finally {
        try { input.pause(); } catch { error = new Error('Terminal cleanup failed'); }
        try { output.write('\n'); } catch { error = new Error('Terminal cleanup failed'); }
      }
      if (error) { value = ''; reject(error); } else resolve(value);
    };
    const onData = (data: Buffer) => {
      for (const character of decoder.write(data)) {
        if (character === '\u0003' || character === '\u0004') { cancelled(); return; }
        if (character === '\r' || character === '\n') { finish(); return; }
        if (character === '\u007f' || character === '\b') value = Array.from(value).slice(0, -1).join('');
        else if (character >= ' ' && character !== '\u007f') value += character;
        else { finish(new Error('Unsupported terminal input')); return; }
        if (value.length > 1024) { finish(new Error('Input too long')); return; }
      }
    };
    input.on('data', onData);
    for (const event of ['end', 'close', 'error']) input.once(event, cancelled);
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) signals.once(signal, cancelled);
  });
}
export function cloudCommand(args: string[]) {
  args = [...args];
  const index = args.indexOf('--session-dir');
  let sessionDirectory: string | undefined;
  if (index >= 0) {
    sessionDirectory = args[index + 1];
    if (!sessionDirectory || !isAbsolute(sessionDirectory)) throw new Error('Session directory must be absolute');
    sessionDirectory = resolve(sessionDirectory);
    const within = relative(resolve(import.meta.dir, '../..'), sessionDirectory);
    if (!within || (!within.startsWith('..' + '/') && !isAbsolute(within))) throw new Error('Session directory must be outside the repository');
    args.splice(index, 2);
  }
  let startRank:number|undefined;
  const rankIndex=args.indexOf('--start-rank');
  if(rankIndex>=0){const raw=args[rankIndex+1];if(!raw||!/^\d+$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new Error('Invalid start rank');startRank=Number(raw);args.splice(rankIndex,2);}
  let month:string|undefined;
  if(args[0]==='--month'&&args.length===2){month=args[1];monthBounds(month);args=['--month'];}
  if(startRank!==undefined&&!month)throw new Error('Start rank requires month mode');
  const showAlbums = args.length === 2 && args[0] === '--albums' && args[1] === '--show-albums';
  if ((!showAlbums && args.length !== 1) || !['--preflight', '--auth-only', '--read', '--albums', '--album-id', '--people-schema', ...(month?['--month']:[])].includes(args[0])) throw new Error('Use --preflight, --auth-only, --read, --albums [--show-albums], --album-id, --month YYYY-MM, or --people-schema');
  return { mode: args[0], showAlbums, ...(sessionDirectory ? {sessionDirectory} : {}),...(month?{month}:{}),...(startRank!==undefined?{startRank}:{}) };
}
export async function loginForProbe(directory: string | undefined, context: ProbeContext, prompt = hiddenPrompt, createClient = () => new AppleAuthClient()): Promise<AuthenticatedAppleSession> {
  const store = directory ? new SessionStore(directory) : undefined;
  context.stage = 'session-validation';
  const saved = await store?.load();
  let client = createClient();
  let session: AuthenticatedAppleSession | undefined;
  let accountName = saved?.accountName ?? '';
  const onStage = (stage: ProbeContext['stage']) => {context.stage=stage;};
  if (saved) {
    try { session = await client.resume(saved, onStage); }
    catch(error) {if (!(error instanceof AppleAuthError) || error.code !== 'session_expired') throw error; client=createClient();}
  }
  if (!session) {
    context.stage='input';
    if (!accountName) accountName=(await prompt('Apple Account (hidden): ')).trim();
    let password=await prompt(saved ? 'Saved Apple Account password (hidden): ' : 'Apple Account password (hidden): ');
    if (!accountName || !password) throw new AppleAuthError('invalid_credentials_input');
    try {session=await client.authenticate({accountName,password,onStage,getCode:()=>prompt('Trusted device verification code (hidden): ')});} finally {password='';}
  }
  if (saved && session.dsid !== saved.dsid) throw new AppleAuthError('session_account_mismatch');
  context.authenticationVerified=true;
  if (store) {context.stage='session-save';await store.save(client.exportSession(accountName,session.dsid));}
  return session;
}
export async function main(args: string[], context: ProbeContext = {stage: "input", authenticationVerified: false}) {
  const command = cloudCommand(args);
  if (command.mode === '--preflight') {
    console.log(JSON.stringify({ runtime: 'Bun', pythonRequired: false, credentialsRead: false, networkAttempted: false, sessionStorage: command.sessionDirectory ? 'private-file-opt-in' : 'memory-only', maxPhotos: 20, maxPages: 2 }));
    return;
  }
  if (!process.stdin.isTTY || !process.stderr.isTTY) throw new Error('Run in your own terminal; no piped credentials');
  const albumRecordName = command.mode === '--album-id' ? await hiddenPrompt('Exact PrimarySync album record ID (hidden): ') : undefined;
  if (albumRecordName !== undefined && (!albumRecordName.trim() || albumRecordName.length > 512)) throw new Error('Invalid album record identity');
  const session = await loginForProbe(command.sessionDirectory, context);
  const onStage = (stage: ProbeContext["stage"]) => { context.stage = stage; };
  if(command.month){console.log(JSON.stringify((await readCloudMonth(session,command.month,onStage,command.startRank)).evidence));return;}
  if (command.mode === '--auth-only') {
    console.log(JSON.stringify({ status: 'authenticated', photosServiceAdvertised: !!session.webservices.ckdatabasews?.url, photosRead: 0, peopleSearchVerified: false }));
    return;
  }
  if (command.mode === '--albums') {
    console.log(JSON.stringify({ status: 'albums-read', ...albumEvidence(await readCloudAlbums(session, onStage), command.showAlbums) }, null, 2));
    return;
  }
  if (command.mode === '--people-schema') {
    console.log(JSON.stringify({ status: 'schema-read', ...await (command.sessionDirectory?resumePersonSchema(session,command.sessionDirectory,undefined,onStage):readCloudPersonSchema(session, onStage)) }, null, 2));
    return;
  }
  const result = await readCloudPhotos(session, albumRecordName, onStage);
  console.log(JSON.stringify({ status: 'read-complete', ...cloudEvidence(result) }, null, 2));
}
export async function runProbe(args: string[], run = main, report = (value: unknown) => console.error(JSON.stringify(value))) {
  const context: ProbeContext = {stage: "input", authenticationVerified: false};
  try { await run(args, context); return 0; }
  catch (error) { report(probeFailure(error, context)); return 1; }
}
if (import.meta.main) process.exitCode = await runProbe(process.argv.slice(2));
