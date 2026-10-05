/** Bun-first synthetic fixed-entry gate. No Keychain, credentials or identities.
 * Checks whether embedded strict string-code restrictions fix the already
 * reproduced CLI/preload gap. A reproduced gap is never a passing K0 result.
 */
import {chmodSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

if(process.platform!=='darwin')throw Error('Requires macOS');
for(const name of ['codesign','sw_vers'])if(!Bun.which(name))throw Error(`Existing dependency unavailable: ${name}`);
const root=mkdtempSync(join(tmpdir(),'icloud-keychain-k0-runtime.')),payload=join(root,'payload');
chmodSync(root,0o700);mkdirSync(payload,{mode:0o700});
const env=Object.fromEntries(Object.entries(process.env).filter(([name])=>!['BUN_','NODE_','DYLD_','JSC_'].some(prefix=>name.startsWith(prefix))));
type Child=Bun.Subprocess<'ignore','pipe','pipe'>;
const children=new Set<Child>(),logs:unknown[]=[];
const record={task:'dual-keychain-K0-runtime-strict-boundary',owner:'main-agent',status:'active',writers:[process.pid],artifacts:root,
 scope:'Bun synthetic executable code-loading only; no Keychain, credentials or installed signing identities',
 knowledge_destination:'playground/keychain/runtime-boundary.md',updated_at:'',transient_cleanup:''};
function save(){record.updated_at=new Date().toISOString();for(const [name,value] of [['record.json',record],['results.json',logs]] as const){const path=join(root,name);writeFileSync(path,JSON.stringify(value,null,2)+'\n',{mode:0o600});chmodSync(path,0o600);}}
async function collect(child:Child,timeout=30000){
 let expired=false;const timer=setTimeout(()=>{expired=true;child.kill('SIGKILL');},timeout);
 try{const [exit,stdout,stderr]=await Promise.all([child.exited,new Response(child.stdout).text(),new Response(child.stderr).text()]);
  children.delete(child);record.writers=record.writers.filter(pid=>pid!==child.pid);save();return{exit,stdout,stderr,expired};
 }finally{clearTimeout(timer);}
}
async function run(name:string,argv:string[],expected=0,extra:Record<string,string>={}){
 const child=Bun.spawn(argv,{cwd:payload,env:{...env,...extra},stdin:'ignore',stdout:'pipe',stderr:'pipe'});
 children.add(child);record.writers.push(child.pid);save();
 const result=await collect(child);logs.push({case:name,...result});save();
 if(result.expired||result.exit!==expected)throw Error(`${name}: unexpected termination; see ${root}/results.json`);
 return result;
}
function digest(path:string){return createHash('sha256').update(readFileSync(path)).digest('hex');}
function output(raw:string,kind:'embedded'|'external',strict?:boolean){
 const value=JSON.parse(raw);
 const keys=kind==='embedded'?'argv,eval,kind,pid':'kind,pid';
 if(Object.keys(value).sort().join(',')!==keys||value.kind!==kind||!Number.isSafeInteger(value.pid)||value.pid<=0||
  (kind==='embedded'&&(value.eval!=='allowed'||!Array.isArray(value.argv)||
   value.argv.some((arg:unknown)=>typeof arg!=='string')||
   value.argv.includes('--disallow-code-generation-from-strings=strict')!==strict)))throw Error('Unexpected runtime output; reconsider the version-specific finding');
 return {kind,eval:kind==='embedded'?value.eval:null,embedded_strict_option:kind==='embedded'?strict:null};
}
console.log(`Experiment record: ${root}/record.json`);save();
let summary:unknown;
try{
 const entry=join(payload,'entry.ts'),external=join(payload,'external.ts'),entitlements=join(payload,'entitlements.plist');
 writeFileSync(entry,'if(process.env.BUN_BE_BUN||process.env.BUN_OPTIONS)process.exit(64);let level="allowed";try{if((0,eval)("1 + 1")!==2)throw Error("Unexpected eval result")}catch(error){if(!(error instanceof EvalError))throw error;level="denied"}console.log(JSON.stringify({kind:"embedded",eval:level,argv:process.execArgv,pid:process.pid}));',{mode:0o600});
 writeFileSync(external,'console.log(JSON.stringify({kind:"external",pid:process.pid}));',{mode:0o600});
 writeFileSync(entitlements,'<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>com.apple.security.cs.allow-jit</key><true/></dict></plist>',{mode:0o600});
 const outcomes:Record<string,unknown>={};
 for(const mode of ['baseline','strict'] as const){
  const binary=join(payload,mode),flags=mode==='strict'?['--compile-exec-argv=--disallow-code-generation-from-strings=strict']:[];
  await run(`compile-${mode}`,[process.execPath,'build','--compile','--no-compile-autoload-dotenv','--no-compile-autoload-bunfig','--no-compile-autoload-tsconfig','--no-compile-autoload-package-json',...flags,entry,'--outfile',binary]);
  await run(`sign-${mode}`,['codesign','--force','--sign','-','--options','runtime','--entitlements',entitlements,'--identifier',`local.icloud-plugin.experiment.runtime.${mode}`,binary]);
  await run(`verify-${mode}-before`,['codesign','--verify','--strict',binary]);
  const bytes=digest(binary),requirement=(await run(`requirement-${mode}-before`,['codesign','-d','-r-',binary])).stdout;
  if(!/^(?:# )?designated => .+\n$/.test(requirement))throw Error('Missing designated requirement');
  const normal=await run(`${mode}-normal`,[binary]);
  if(normal.stderr)throw Error('Unexpected normal runtime diagnostics');
  outcomes[`${mode}-normal`]=output(normal.stdout,'embedded',mode==='strict');
  const cli=await run(`${mode}-external-cli`,[binary,external],0,{BUN_BE_BUN:'1'});
  if(cli.stderr)throw Error('Unexpected CLI runtime diagnostics');
  outcomes[`${mode}-external-cli`]=output(cli.stdout,'external');
  const preload=await run(`${mode}-external-preload`,[binary],64,{BUN_OPTIONS:`--preload=${external}`});
  if(preload.stderr)throw Error('Unexpected preload runtime diagnostics');
  outcomes[`${mode}-external-preload`]=output(preload.stdout,'external');
  await run(`verify-${mode}-after`,['codesign','--verify','--strict',binary]);
  const after=(await run(`requirement-${mode}-after`,['codesign','-d','-r-',binary])).stdout;
  if(bytes!==digest(binary)||requirement!==after)throw Error('Executable identity changed');
 }
 summary={date:new Date().toISOString().slice(0,10),runner:'Bun',bun:(await run('bun-version',[process.execPath,'--version'])).stdout.trim(),
  revision:(await run('bun-revision',[process.execPath,'--revision'])).stdout.trim(),platform:(await run('os-version',['sw_vers','-productVersion'])).stdout.trim(),
  scope:'same-agent synthetic signed executable code-loading checks',outcomes,signatures_verified:true,bytes_and_designated_requirements_unchanged:true,
  keychain_operations:false,production_signer:false,k0_passed:false,
  finding:'On this Bun revision the embedded strict option appears in execArgv but eval remains allowed; external CLI and file preload also execute. The current documentation is not evidence of an enforced local policy.',
  not_verified:['other code-loading routes','authenticated IPC','production signer/update continuity','dedicated runtime build or embedded host','Keychain API/accessibility/lifecycle']};
 writeFileSync(join(root,'summary.json'),JSON.stringify(summary,null,2)+'\n',{mode:0o600});record.status='strict-code-loading-gap-reproduced';
}catch(error){record.status='failed-retained-for-reconciliation';throw error;}
finally{
 for(const child of [...children]){child.kill('SIGKILL');logs.push({case:'fixture-terminal',...await collect(child,5000)});}
 rmSync(payload,{recursive:true});record.writers=[];record.transient_cleanup='Owned payload removed after all child processes observed terminal';save();
}
console.log(JSON.stringify({artifacts:root,summary},null,2));
