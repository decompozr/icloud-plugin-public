/** Explicit private native setup: reuse dependencies, never install or grant access. */
import {join,dirname} from 'node:path';
import {mkdir,cp,copyFile,readFile,writeFile,rmdir,realpath,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseReaderSetupOptions} from './setup-reader-options.js';
import {reserveSetupDirectory} from './setup-options.js';

async function capture(args:string[],env=process.env){const child=Bun.spawn(args,{stdout:'pipe',stderr:'pipe',env});const [out,err,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(exit!==0)throw Error('Reader setup prerequisite failed: '+(err||out).slice(-3000));return out.trim()||err.trim();}
export async function prepareReader(args:string[]){
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
 const project=await createReaderXcodeProject(native,options.directory);
 return {options,native,project,app,contents,resources,library,helper:join(contents,'MacOS','photos-reader')};
}
export async function createReaderXcodeProject(native:string,directory:string){
 const projectRoot=join(directory,'Xcode'),project=join(projectRoot,'PhotosReader.xcodeproj');
 await mkdir(projectRoot);
 await mkdir(project);
 await copyFile(join(native,'PhotosReader.xcodeproj','project.pbxproj'),join(project,'project.pbxproj'));
 for(const name of ['PhotosReader.swift','ReaderInfo.plist','sign-reader-resources.py'])await copyFile(join(native,name),join(projectRoot,name));
 const projectFile=join(project,'project.pbxproj');
 const specification=await readFile(projectFile,'utf8');
 await writeFile(projectFile,specification.replaceAll('PHOTOS_READER_RESOURCES = "";','PHOTOS_READER_RESOURCES = "$(SRCROOT)/../DecompozR Photos Reader.app/Contents/Resources";'));
 return project;
}
export async function setupReader(args:string[]){
 const {options,native,project,app,resources,library,helper}=await prepareReader(args);
 const developerDirectory=process.env.DEVELOPER_DIR??'/Applications/Xcode.app/Contents/Developer';
 await capture(['xcodebuild','-project',project,'-scheme','PhotosReader','-configuration','Release','-derivedDataPath',join(options.directory,'DerivedData'),'CONFIGURATION_BUILD_DIR='+options.directory,'PHOTOS_READER_RESOURCES='+resources,'CODE_SIGN_IDENTITY='+options.sign,'CODE_SIGNING_ALLOWED=YES','build'],{...process.env,DEVELOPER_DIR:developerDirectory});
 await capture(['codesign','--verify','--deep','--strict',app]);
 const signature=await capture(['codesign','-d','-r-',app]);
 const sha256=async(path:string)=>createHash('sha256').update(await readFile(path)).digest('hex');
 await writeFile(join(options.directory,'runtime-manifest.json'),JSON.stringify({schemaVersion:1,createdAt:new Date().toISOString(),readerHelper:helper,library,signature,helperSha256:await sha256(helper),sourceSha256:await sha256(join(native,'PhotosReader.swift')),readerSha256:await sha256(join(resources,'reader.py')),dependenciesBundled:true,permissionVerified:false},null,2)+'\n',{mode:0o600,flag:'wx'});
 await rmdir(join(options.directory,'.setup-in-progress'));
 return {readerHelper:helper,app,library,permissionGranted:false,changesPerformed:false};
}
if(import.meta.main){const args=process.argv.slice(2);if(args.includes('--prepare-only')){const stage=await prepareReader(args.filter(x=>x!=='--prepare-only'));console.log(JSON.stringify({app:stage.app,resources:stage.resources,project:stage.project,signed:false,installed:false}));}else console.log(JSON.stringify(await setupReader(args)));}
