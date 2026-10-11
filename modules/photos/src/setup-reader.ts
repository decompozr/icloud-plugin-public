/** Explicit private native setup: reuse dependencies, never install or grant access. */
import {join,dirname} from 'node:path';
import {mkdir,cp,copyFile,readFile,writeFile,rmdir,realpath,lstat,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseReaderSetupOptions} from './setup-reader-options.js';
import {reserveSetupDirectory} from './setup-options.js';

async function capture(args:string[]){const child=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});const [out,err,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(exit!==0)throw Error('Reader setup prerequisite failed: '+err.slice(0,1000));return out.trim()||err.trim();}
export async function setupReader(args:string[]){
 const options=parseReaderSetupOptions(args);
 const library=await realpath(options.library);
 if(!library.endsWith('.photoslibrary')||!(await lstat(library)).isDirectory())throw Error('Selected Photos library required');
 const dependencies=JSON.parse(await capture([options.python,'-I','-c','import sys,pathlib,osxphotos,importlib.metadata as m,json; assert sys.version_info[:2]==(3,12); assert m.version("osxphotos")=="0.77.2"; print(json.dumps({"base":sys.base_prefix,"site":str(pathlib.Path(osxphotos.__file__).parent.parent)}))'])) as {base:string;site:string};
 const native=fileURLToPath(new URL('./native/',import.meta.url));
 await reserveSetupDirectory(options.directory);
 const app=join(options.directory,'DecompozR Photos Reader.app'),contents=join(app,'Contents'),resources=join(contents,'Resources');
 await mkdir(join(contents,'MacOS'),{recursive:true});await mkdir(resources);
 await copyFile(join(native,'ReaderInfo.plist'),join(contents,'Info.plist'));
 await copyFile(join(dirname(native),'reader.py'),join(resources,'reader.py'));
 await copyFile(join(dirname(native),'reader-bootstrap.py'),join(resources,'reader-bootstrap.py'));
 await writeFile(join(resources,'reader-config.json'),JSON.stringify({schemaVersion:1,library})+'\n',{mode:0o600,flag:'wx'});
 // A permission-bearing app must not execute a mutable interpreter or modules
 // outside its signed bundle. Copy the already installed pinned dependencies.
 await cp(dependencies.base,join(resources,'python'),{recursive:true,dereference:true});
 await cp(dependencies.site,join(resources,'python/lib/python3.12/site-packages'),{recursive:true,dereference:true});
 await capture([join(resources,'python/bin/python3.12'),'-I','-S','-B','-c','import sys,pathlib; p=pathlib.Path(sys.argv[1]); sys.path[:]=[str(p),str(p/"lib-dynload"),str(p/"site-packages")]; import osxphotos,importlib.metadata as m; assert sys.version_info[:2]==(3,12); assert m.version("osxphotos")=="0.77.2"',join(resources,'python/lib/python3.12')]);
 const helper=join(contents,'MacOS','photos-reader');
 await capture(['swiftc','-parse-as-library',join(native,'PhotosReader.swift'),'-o',helper,'-framework','Security','-Xlinker','-sectcreate','-Xlinker','__TEXT','-Xlinker','__info_plist','-Xlinker',join(contents,'Info.plist')]);
 const magic=new Set(['feedface','feedfacf','cefaedfe','cffaedfe','cafebabe','bebafeca','cafebabf','bfbafeca']);
 const codePaths:string[]=[];
 async function collectCode(directory:string){for(const item of await readdir(directory,{withFileTypes:true})){const path=join(directory,item.name);if(item.isSymbolicLink())throw Error('Reader bundle must be self-contained');if(item.isDirectory())await collectCode(path);else if(item.isFile()){const data=await readFile(path);if(magic.has(data.subarray(0,4).toString('hex')))codePaths.push(path);}}}
 await collectCode(contents);
 await capture(['codesign','--sign',options.sign,'--force','--options','runtime','--timestamp=none',...codePaths]);
 await capture(['codesign','--sign',options.sign,'--options','runtime','--timestamp=none',app]);
 await capture(['codesign','--verify','--deep','--strict',app]);
 const signature=await capture(['codesign','-d','-r-',app]);
 const sha256=async(path:string)=>createHash('sha256').update(await readFile(path)).digest('hex');
 await writeFile(join(options.directory,'runtime-manifest.json'),JSON.stringify({schemaVersion:1,createdAt:new Date().toISOString(),readerHelper:helper,library,signature,helperSha256:await sha256(helper),sourceSha256:await sha256(join(native,'PhotosReader.swift')),readerSha256:await sha256(join(resources,'reader.py')),dependenciesBundled:true,permissionVerified:false},null,2)+'\n',{mode:0o600,flag:'wx'});
 await rmdir(join(options.directory,'.setup-in-progress'));
 return {readerHelper:helper,app,library,permissionGranted:false,changesPerformed:false};
}
if(import.meta.main)console.log(JSON.stringify(await setupReader(process.argv.slice(2))));
