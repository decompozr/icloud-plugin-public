import {z} from 'zod';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {cp,mkdir,readFile,readdir,lstat,realpath,writeFile} from 'node:fs/promises';

export const serviceAppSchema=z.object({app:z.literal('DecompozR Studio.app'),signingTeam:z.literal('74NBML8KJB')}).strict();
export type ServiceApp=z.infer<typeof serviceAppSchema>;
export const serviceExecutable=(prefix:string)=>join(prefix,'current/DecompozR Studio.app/Contents/MacOS/studio-service');
export async function verifyServiceApp(root:string,metadata:ServiceApp,version?:string){
 const app=join(root,metadata.app);
 if(!(await lstat(app)).isDirectory())throw Error('SERVICE_APP_ROOT_INVALID');
 const canonical=await realpath(app);if(!canonical.startsWith((await realpath(root))+'/'))throw Error('SERVICE_APP_ROOT_INVALID');
 async function contained(path:string):Promise<void>{
  const resolved=await realpath(path);
  if(resolved!==canonical&&!resolved.startsWith(canonical+'/'))throw Error('SERVICE_APP_EXTERNAL_SYMLINK');
  const info=await lstat(path);
  if(info.isDirectory())for(const child of await readdir(path))await contained(join(path,child));
 }
 await contained(app);
 if(version){const p=Bun.spawn(['/usr/bin/plutil','-extract','CFBundleVersion','raw','-o','-',join(app,'Contents/Info.plist')],{stdout:'pipe',stderr:'ignore'});const actual=(await new Response(p.stdout).text()).trim();if(await p.exited!==0||actual!==version)throw Error('SERVICE_APP_VERSION_MISMATCH');}
 for(const args of [['--verify','--deep','--strict',app],['--verify','--strict','-R',`=anchor apple generic and certificate leaf[subject.OU] = "${metadata.signingTeam}" and identifier "com.decompozr.studio-service"`,app]]){
  const child=Bun.spawn(['/usr/bin/codesign',...args],{stdin:'ignore',stdout:'ignore',stderr:'ignore'});
  if(await child.exited!==0)throw Error('SERVICE_APP_SIGNATURE_INVALID');
 }
}
export async function installedServiceApp(prefix:string){
 let metadata;try{metadata=JSON.parse(await readFile(join(prefix,'current/artifact.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return undefined;throw error;}
 if(!metadata.serviceApp)return undefined;
 const app=serviceAppSchema.parse(metadata.serviceApp);
 await verifyServiceApp(join(prefix,'current'),app,metadata.version);
 return serviceExecutable(prefix);
}
/** Pin only a live, recorded legacy supervisor; never adopt an arbitrary Bun path. */
export async function rememberLegacyExecutor(prefix:string,sourceApp:string){
 const receipt=join(prefix,'runtime/legacy-service-executor.json');
 if(await Bun.file(receipt).exists())return;
 let record;try{record=JSON.parse(await readFile(join(prefix,'runtime/service-process.json'),'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 if(record?.launcherPid)return;
 async function capture(args:string[]){const p=Bun.spawn(args,{stdout:'pipe',stderr:'ignore'});const out=await new Response(p.stdout).text();if(await p.exited!==0)throw Error('LEGACY_SERVICE_PROOF_REQUIRED');return out.trim();}
 const expected=[join(prefix,'current/icloud-plugin.js'),'run','--prefix',prefix,'--no-open'];
 const plist=join(homedir(),'Library/LaunchAgents/com.decompozr.icloud-plugin.plist');
 let args:string[];
 if(await Bun.file(plist).exists())args=z.array(z.string()).parse(JSON.parse(await capture(['/usr/bin/plutil','-extract','ProgramArguments','json','-o','-',plist])));
 else if(record)args=[await capture(['/bin/ps','-p',String(record.pid),'-o','comm=']),...expected];
 else return;
 if(!args[0]?.startsWith('/')||JSON.stringify(args.slice(1))!==JSON.stringify(expected))throw Error('LEGACY_SERVICE_PROOF_REQUIRED');
 const pin=z.object({bunSHA256:z.string().regex(/^[a-f0-9]{64}$/)}).passthrough().parse(JSON.parse(await readFile(join(sourceApp,'Contents/Resources/runtime-build.json'),'utf8')));
 const hash=createHash('sha256').update(await readFile(args[0])).digest('hex');
 if(hash!==pin.bunSHA256)throw Error('LEGACY_SERVICE_EXECUTOR_MISMATCH');
 const canonicalArgs=[args[0],await realpath(args[1]!),...args.slice(2)];
 const job=Bun.spawn(['/bin/launchctl','print','gui/'+process.getuid!()+'/com.decompozr.icloud-plugin'],{stdout:'pipe',stderr:'ignore'}),loaded=await new Response(job.stdout).text();await job.exited;
 const pid=Number(loaded.match(/(?:^|\n)\s*pid = (\d+)/)?.[1]);
 if(pid&&!record)throw Error('LEGACY_SERVICE_PROOF_REQUIRED');
 if(record){if((pid&&record.pid!==pid)||record.command!==canonicalArgs.join(' ')||await capture(['/bin/ps','-p',String(record.pid),'-o','lstart='])!==record.startedAt||await capture(['/bin/ps','-p',String(record.pid),'-o','command='])!==args.join(' '))throw Error('LEGACY_SERVICE_PROOF_REQUIRED');}
 await writeFile(receipt,JSON.stringify({bun:args[0],sha256:hash})+'\n',{mode:0o600,flag:'wx'});
}
/** Prepare an unsigned release candidate. Never install, authorize or start it. */
export async function prepareServiceApp(root:string,source:string,version:string){
 const app=join(root,'DecompozR Studio.app'),resources=join(app,'Contents/Resources');
 await mkdir(join(app,'Contents/MacOS'),{recursive:true});
 await mkdir(resources,{recursive:true});
 const payload=join(resources,'payload');await mkdir(payload);
 for(const file of ['apps','icloud-plugin.js','LICENSE','THIRD_PARTY_NOTICES.md'])await cp(join(root,file),join(payload,file),{recursive:true,verbatimSymlinks:true});
 await cp(process.execPath,join(resources,'bun'));
 await cp(join(import.meta.dir,'native/bun-LICENSE.md'),join(resources,'bun-LICENSE.md'));
 await Bun.write(join(resources,'runtime-build.json'),JSON.stringify({bun:Bun.version,bunSHA256:createHash('sha256').update(await readFile(process.execPath)).digest('hex')})+'\n');
 const compile=Bun.spawn(['swiftc','-parse-as-library',source,'-o',join(app,'Contents/MacOS/studio-service'),'-framework','Security'],{stdout:'inherit',stderr:'inherit'});
 if(await compile.exited!==0)throw Error('SERVICE_APP_BUILD_FAILED');
 await Bun.write(join(app,'Contents/Info.plist'),`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.decompozr.studio-service</string><key>CFBundleName</key><string>DecompozR Studio</string><key>CFBundleExecutable</key><string>studio-service</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>${version}</string><key>CFBundleShortVersionString</key><string>${version}</string><key>LSUIElement</key><true/><key>NSAppleEventsUsageDescription</key><string>Perform owner-approved changes in Photos.</string><key>NSPhotoLibraryUsageDescription</key><string>Read the selected Photos library for enabled Photos capabilities.</string></dict></plist>`);
 return app;
}
