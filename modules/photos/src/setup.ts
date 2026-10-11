/** Explicit operator setup. No provisioning occurs during an MCP request. */
import {join} from 'node:path';
import {mkdir,lstat,copyFile,readFile,writeFile,rmdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {parseSetupOptions,reserveSetupDirectory} from './setup-options.js';
const options=parseSetupOptions(process.argv.slice(2));
const target=options.directory;
const local=fileURLToPath(new URL('./native/',import.meta.url));
const source=await lstat(local).then(()=>local).catch(()=>fileURLToPath(new URL('./photos/native/',import.meta.url)));
async function command(args:string[]){const child=Bun.spawn(args,{stdout:'inherit',stderr:'inherit'});if(await child.exited!==0)throw Error('Photos setup failed; partial runtime retained');}
async function capture(args:string[]){const child=Bun.spawn(args,{stdout:'pipe',stderr:'pipe'});const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(exit!==0)throw Error('Photos prerequisite check failed');return (stdout+stderr).trim();}
let python=options.python;
// Verify an existing environment before creating any runtime or installing anything.
if(python)await capture([python,'-c','import sys,importlib.metadata as m; assert sys.version_info[:2] == (3,12); assert m.version("osxphotos") == "0.77.2"; assert m.version("photoscript") == "0.6.1"']);
await reserveSetupDirectory(target);
if(!python){
 await command(['uv','venv','--python','3.12',join(target,'venv')]);
 python=join(target,'venv/bin/python');
 await command(['uv','pip','install','--python',python,'osxphotos==0.77.2','photoscript==0.6.1']);
}
const app=join(target,'iCloud Photos Helper.app','Contents');await mkdir(join(app,'MacOS'),{recursive:true});await copyFile(join(source,'Info.plist'),join(app,'Info.plist'));
const helper=join(app,'MacOS','photos-helper');
const names=['PhotosHelper.swift'];
await command(['swiftc','-parse-as-library',...names.map(name=>join(source,name)),'-o',helper,'-framework','Photos','-framework','AppKit','-Xlinker','-sectcreate','-Xlinker','__TEXT','-Xlinker','__info_plist','-Xlinker',join(source,'Info.plist')]);
await command(['codesign','--sign',options.sign,join(target,'iCloud Photos Helper.app')]);
await command(['codesign','--verify','--strict',join(target,'iCloud Photos Helper.app')]);
const designatedRequirement=await capture(['codesign','-d','-r-',join(target,'iCloud Photos Helper.app')]);
const sha256=async(path:string)=>createHash('sha256').update(await readFile(path)).digest('hex');
const sourceSha256=Object.fromEntries(await Promise.all([...names,'Info.plist'].map(async name=>[name,await sha256(join(source,name))])));
await writeFile(join(target,'runtime-manifest.json'),JSON.stringify({schemaVersion:1,createdAt:new Date().toISOString(),python,nativeHelper:helper,pythonReused:!!options.python,signingMode:options.sign==='-'?'ad_hoc':'identity',designatedRequirement,helperSha256:await sha256(helper),sourceSha256,photosPermissionVerified:false,installed:false},null,2)+'\n',{mode:0o600,flag:'wx'});
await rmdir(join(target,'.setup-in-progress'));
console.log(JSON.stringify({python,nativeHelper:helper,manifest:join(target,'runtime-manifest.json'),nextStep:'Configure a dedicated signed Photos Reader for library access, then explicitly authorize this PhotoKit helper and recheck actual permissions. Ad-hoc builds may require renewed consent after updates. No Photos changes performed.'}));
