import {existsSync} from 'node:fs';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {join,dirname,isAbsolute} from 'node:path';
import {z} from 'zod';
import {assetSchema,albumSchema,mutationSchema,cleanupCandidateSchema,PhotosError,type Mutation,type PhotosProvider} from './contracts.js';
import {readReview} from './shared-review.js';
const moduleDirectory=dirname(fileURLToPath(import.meta.url));
const base=existsSync(join(moduleDirectory,'reader.py'))?moduleDirectory:join(moduleDirectory,'photos');
const envelope=z.discriminatedUnion('ok',[z.object({ok:z.literal(true),result:z.unknown()}).strict(),z.object({ok:z.literal(false),error:z.string().regex(/^[a-z_]{1,80}$/)}).strict()]);
const snapshot=z.object({libraryScope:z.string().regex(/^[a-f0-9]{16}$/),mutation:mutationSchema,assets:z.array(assetSchema).max(50),album:albumSchema.optional(),members:z.array(z.string()).max(100000).optional()}).strict();
export interface ProviderSettings {python:string;library:string;nativeHelper:string;sidecarDirectory?:string;timeoutMs?:number;stateDirectory?:string;reviewDirectory?:string}
/** Launch Services preserves the app's Photos consent identity. Never retry a launch. */
export async function runNative(helper:string,input:unknown,timeoutMs=60000):Promise<unknown>{
 const app=dirname(dirname(dirname(helper)));
 if(!isAbsolute(helper)||!app.endsWith('.app')||join(app,'Contents','MacOS','photos-helper')!==helper)throw new PhotosError('packaged_helper_required');
 const encoded=JSON.stringify(input);if(Buffer.byteLength(encoded)>65536)throw new PhotosError('request_too_large');
 const directory=await mkdtemp(join(tmpdir(),'icloud-photos-native-'));
 let child:Bun.Subprocess|undefined;
 const deadline=Date.now()+timeoutMs;
 try{
  const source=join(directory,'input.json'),target=join(directory,'output.json');
  await writeFile(source,encoded,{mode:0o600});await writeFile(target,'',{mode:0o600});
  const interactive=(input as {command?:string})?.command==='authorize';
  const args=['/usr/bin/open','-n',...(interactive?[]:['-g']),'-i',source,'-o',target,'--stderr','/dev/null',app];
  if((input as {command?:string})?.command==='authorize')args.push('--args','--authorize');
  child=Bun.spawn(args,{stdout:'ignore',stderr:'ignore'});
  // open -W can fail to track short-lived apps. The response, not launcher exit,
  // establishes completion. A timeout after a write remains an unknown outcome.
  while(Date.now()<deadline){
   if((await stat(target)).size>12*1024*1024)throw new PhotosError('provider_output_limit');
   const output=await readFile(target,'utf8');
   if(output.endsWith('\n')){
    let value;try{value=envelope.parse(JSON.parse(output));}catch{throw new PhotosError('invalid_provider_response');}
    if(!value.ok)throw new PhotosError(value.error);return value.result;
   }
   if(child.exitCode!==null&&child.exitCode!==0)throw new PhotosError('provider_failed');
   await new Promise(resolve=>setTimeout(resolve,25));
  }
  throw new PhotosError('provider_timeout');
 }finally{if(child&&child.exitCode===null)child.kill();await rm(directory,{recursive:true,force:true});}
}
/** No shell, stdout/stderr bounds, fixed errors, and no automatic retry. */
export async function runProcess(argv:string[],input:unknown,timeoutMs=60000):Promise<unknown>{
 const encoded=JSON.stringify(input);if(Buffer.byteLength(encoded)>65536)throw new PhotosError('request_too_large');
 let child:Bun.Subprocess<"pipe","pipe","pipe">;try{child=Bun.spawn(argv,{stdin:'pipe',stdout:'pipe',stderr:'pipe',env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});}catch{throw new PhotosError('provider_unavailable');}
 let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill();},timeoutMs);
 async function bounded(stream:ReadableStream<Uint8Array>,limit:number){const reader=stream.getReader();const chunks:Uint8Array[]=[];let size=0;while(true){const next=await reader.read();if(next.done)break;size+=next.value.length;if(size>limit){child.kill();throw new PhotosError('provider_output_limit');}chunks.push(next.value);}return Buffer.concat(chunks);}
 try{
  child.stdin.write(encoded);child.stdin.end();
  const [out,,code]=await Promise.all([bounded(child.stdout,12*1024*1024),bounded(child.stderr,128*1024),child.exited]);
  if(timedOut)throw new PhotosError('provider_timeout');if(code!==0)throw new PhotosError('provider_failed');
  const value=envelope.parse(JSON.parse(out.toString('utf8')));if(!value.ok)throw new PhotosError(value.error);return value.result;
 }catch(e){child.kill();throw e instanceof PhotosError?e:new PhotosError('invalid_provider_response');}finally{clearTimeout(timer);}
}
export class LocalPhotosProvider implements PhotosProvider {
 constructor(private readonly settings:ProviderSettings){if(![settings.python,settings.library,settings.nativeHelper].every(isAbsolute))throw new PhotosError('absolute_provider_paths_required');}
 private reader(command:string,input:unknown){return runProcess([this.settings.python,join(this.settings.sidecarDirectory??base,'reader.py')],{library:this.settings.library,command,input},this.settings.timeoutMs);}
 async read(command:string,input:unknown):Promise<unknown>{
  const value=await this.reader(command,input);
  if(command==='detail')return assetSchema.parse(value);
  if(command==='query')return z.union([
   z.object({status:z.literal('person_selection_required'),names:z.array(z.string()).max(100)}).strict(),
   z.object({status:z.literal('ok'),assets:z.array(assetSchema).max(100),total:z.number().int().nonnegative(),resolvedPerson:z.string().nullable(),nextOffset:z.number().int().nullable(),source:z.literal('local_synced_snapshot')}).strict()
  ]).parse(value);
  if(command==='albums')return z.object({albums:z.array(albumSchema).max(100),total:z.number().int().nonnegative(),nextOffset:z.number().int().nullable()}).strict().parse(value);
  if(command==='persons')return z.object({persons:z.array(z.object({name:z.string(),count:z.number().int().nonnegative()})).max(100),total:z.number().int().nonnegative(),complete:z.boolean()}).strict().parse(value);
  if(command==='preview')return z.object({assetId:z.string(),mimeType:z.enum(['image/jpeg','image/png']),data:z.string().max(2800000)}).strict().parse(value);
  if(command==='compare')return z.object({source:z.literal('local_synced_snapshot'),album:albumSchema,results:z.array(z.object({assetId:z.string(),status:z.enum(['confirmed','probable','ambiguous','not_found']),candidates:z.array(z.object({assetId:z.string(),sameFilename:z.boolean(),secondsApart:z.number().nullable(),sameMediaType:z.boolean(),sameDimensions:z.boolean(),sameIdentity:z.boolean()}).strict()).max(1000)}).strict()).max(50)}).strict().parse(value);
  if(command==='cleanup')return z.object({source:z.literal('local_synced_snapshot'),reviewOnly:z.literal(true),total:z.number().int().nonnegative(),candidates:z.array(cleanupCandidateSchema).max(100),complete:z.boolean(),nextOffset:z.number().int().nonnegative().nullable()}).strict().parse(value);
  if(command==='health'){
   const health=z.object({provider:z.literal('osxphotos'),version:z.literal('0.77.2'),libraryScope:z.string(),systemLibrary:z.boolean(),source:z.literal('local_synced_snapshot'),serverSyncVerified:z.literal(false)}).strict().parse(value);
   let native:unknown;try{native=z.object({authorization:z.number().int(),authorized:z.boolean()}).strict().parse(await runNative(this.settings.nativeHelper,{command:'health'},this.settings.timeoutMs));}catch{native={authorized:false,error:'native_helper_unavailable'};}
   return {...health,native,sharedAlbumWriteVerified:false};
  }
  throw new PhotosError('unsupported_command');
 }
 async inspect(mutation:Mutation){
  const state=snapshot.parse(await this.reader('inspect',mutation));
  if(mutation.action!=='set_metadata')await this.native('probe',mutation);
  // Metadata uses Photos scripting; checking property preconditions happens there.
  return state;
 }
 private native(command:string,mutation:Mutation){return runNative(this.settings.nativeHelper,{command,mutation},this.settings.timeoutMs);}
 private reviewPath(){const directory=this.settings.reviewDirectory??(this.settings.stateDirectory?join(this.settings.stateDirectory,'shared-reviews'):undefined);if(!directory)throw new PhotosError('review_runtime_not_configured');return directory;}
 async reviewStatus(operationId:string){return readReview(this.reviewPath(),operationId);}
 async apply(mutation:Mutation,expected:unknown){
  if(mutation.action==='post_to_shared_album')throw new PhotosError('native_review_required');
  const current=snapshot.parse(await this.reader('inspect',mutation));
  if(JSON.stringify(current)!==JSON.stringify(expected))throw new PhotosError('stale_plan');
  const result=mutation.action==='set_metadata'
   ? await runProcess([this.settings.python,join(this.settings.sidecarDirectory??base,'metadata-write.py')],{library:this.settings.library,mutation,expected:current},this.settings.timeoutMs)
   : await this.native('apply',mutation);
  return z.object({status:z.enum(['applied','outcome_unknown','stale_plan','wrong_open_library']),localReadbackVerified:z.boolean().optional(),serverSyncVerified:z.literal(false).optional(),createdUuid:z.string().optional(),items:z.array(z.object({uuid:z.string(),status:z.enum(['applied','outcome_unknown','not_attempted'])}).strict()).max(50).optional()}).strict().parse(result);
 }
}
