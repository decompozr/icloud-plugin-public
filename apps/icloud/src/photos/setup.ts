/** Explicit operator setup: installs only an isolated pinned Python environment. */
import {resolve,join} from 'node:path';
import {mkdir,lstat,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const directory=process.argv[2];
if(!directory)throw Error('Usage: bun setup.ts /absolute/private/photos-runtime');
const target=resolve(directory);await mkdir(target,{recursive:true,mode:0o700});const st=await lstat(target);
if(st.isSymbolicLink()||!st.isDirectory()||(st.mode&0o777)!==0o700||st.uid!==process.getuid?.())throw Error('Private owned directory required');
const local=fileURLToPath(new URL('./native/',import.meta.url));
const source=await lstat(local).then(()=>local).catch(()=>fileURLToPath(new URL('./photos/native/',import.meta.url)));
if(await lstat(join(target,'venv')).then(()=>true).catch(()=>false))throw Error('Existing environment retained; choose a new runtime directory for setup/update');
async function command(args:string[]){const child=Bun.spawn(args,{stdout:'inherit',stderr:'inherit'});if(await child.exited!==0)throw Error('Photos setup failed');}
await command(['uv','venv','--python','3.12',join(target,'venv')]);
const python=join(target,'venv/bin/python');
await command(['uv','pip','install','--python',python,'osxphotos==0.77.2','photoscript==0.6.1']);
const app=join(target,'iCloud Photos Helper.app','Contents');await mkdir(join(app,'MacOS'),{recursive:true});await copyFile(join(source,'Info.plist'),join(app,'Info.plist'));
const helper=join(app,'MacOS','photos-helper');
await command(['swiftc',...['PhotosHelper.swift','SharedAlbumReview.swift','ReviewCatalog.swift','ReviewJournal.swift'].map(name=>join(source,name)),'-o',helper,'-framework','Photos','-framework','PhotosUI','-framework','AppKit','-Xlinker','-sectcreate','-Xlinker','__TEXT','-Xlinker','__info_plist','-Xlinker',join(source,'Info.plist')]);
await command(['codesign','--force','--sign','-',join(target,'iCloud Photos Helper.app')]);
console.log(JSON.stringify({python,nativeHelper:helper,nextStep:'Configure the selected library, grant host Full Disk Access, then explicitly authorize PhotoKit using the helper. No Photos changes performed.'}));
